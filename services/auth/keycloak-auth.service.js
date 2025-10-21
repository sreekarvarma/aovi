const session = require('express-session');
const EmailService = require('../email/email.service');

class KeycloakAuthService {
  constructor() {
    this.keycloak = null;
    this.memoryStore = null;
    this.initialized = false;
    this.authTokens = new Map();
    this.emailService = new EmailService();
    this.accessControl = null;
    this.init();
  }

  init() {
    try {
      const Keycloak = require('keycloak-connect');
      this.memoryStore = new session.MemoryStore();

      const keycloakConfig = {
        realm: process.env.KEYCLOAK_REALM || 'aovi',
        'auth-server-url': process.env.KEYCLOAK_URL || 'http://keycloak:8080',
        'ssl-required': 'external',
        resource: process.env.KEYCLOAK_CLIENT_ID || 'aovi-app',
        credentials: {
          secret: process.env.KEYCLOAK_CLIENT_SECRET || process.env.JWT_SECRET
        },
        'confidential-port': 0
      };

      this.keycloak = new Keycloak({ store: this.memoryStore }, keycloakConfig);
      this.initialized = true;
    } catch (error) {
      console.warn('Keycloak authentication service failed to initialize:', error.message);
      this.initialized = false;
      if (!this.memoryStore) {
        this.memoryStore = new session.MemoryStore();
      }
    }
  }

  getSessionMiddleware() {
    return session({
      secret: process.env.JWT_SECRET,
      resave: false,
      saveUninitialized: false,
      store: this.memoryStore,
      name: 'connect.sid',
      cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: true, // Required for HTTPS
        sameSite: 'lax', // allows same-site navigation
        path: '/'
      }
    });
  }

  getKeycloakMiddleware() {
    if (this.initialized && this.keycloak) {
      return this.keycloak.middleware();
    }
    return (req, res, next) => {
      console.log('Keycloak not available, using fallback middleware');
      next();
    };
  }

  authorizeBasic() {
    if (this.initialized && this.keycloak) {
      return this.keycloak.protect();
    }
    return (req, res, next) => {
      console.log('Keycloak not available, allowing request without authentication');
      next();
    };
  }

  authorizeAdmin() {
    if (this.initialized && this.keycloak) {
      return this.keycloak.protect(['realm:admin', 'realm:superadmin']);
    }
    return (req, res, next) => {
      console.log('Keycloak not available, allowing admin request without authentication');
      next();
    };
  }

  authorizeSuperAdmin() {
    if (this.initialized && this.keycloak) {
      return this.keycloak.protect('realm:superadmin');
    }
    return (req, res, next) => {
      console.log('Keycloak not available, allowing superadmin request without authentication');
      next();
    };
  }

  addUserToRequest() {
    return (req, res, next) => {
      if (!req.body) req.body = {};

      if (this.initialized && req.kauth && req.kauth.grant && req.kauth.grant.access_token) {
        const token = req.kauth.grant.access_token;
        const content = token.content;

        req.body.authorized = true;
        req.body.user = {
          id: content.sub,
          name: content.preferred_username || content.email,
          email: content.email,
          role: this.extractRoles(content),
          firstName: content.given_name,
          lastName: content.family_name
        };
      } else {
        req.body.authorized = false;
        req.body.user = null;
        if (!this.initialized) {
          console.log('Keycloak not available, setting unauthorized user');
        }
      }

      next();
    };
  }

  extractRoles(tokenContent) {
    const roles = [];
    
    if (tokenContent.realm_access && tokenContent.realm_access.roles) {
      roles.push(...tokenContent.realm_access.roles);
    }

    const clientId = process.env.KEYCLOAK_CLIENT_ID || 'aovi-app';
    if (tokenContent.resource_access && tokenContent.resource_access[clientId]) {
      roles.push(...tokenContent.resource_access[clientId].roles);
    }

    const appRoles = ['basic', 'admin', 'superadmin'];
    return roles.filter(role => appRoles.includes(role));
  }

  checkItemAccess(itemIdParam = 'id', action = 'read') {
    return async (req, res, next) => {
      try {
        if (!req.body.authorized) {
          return res.status(401).json({ message: 'Not authenticated' });
        }

        const itemId = req.params[itemIdParam];
        if (!itemId) {
          return res.status(400).json({ message: 'Item ID required' });
        }

        if (!this.accessControl) {
          console.warn('Access control not configured, allowing request');
          return next();
        }

        const permission = await this.accessControl.checkPermission({
          itemId,
          userId: req.body.user.id,
          userRoles: req.body.user.role,
          action
        });

        if (!permission.allowed) {
          return res.status(403).json({ 
            message: 'Access denied', 
            reason: permission.reason 
          });
        }

        req.itemAccess = permission;
        next();
      } catch (error) {
        console.error('Item access check failed:', error);
        res.status(500).json({ message: 'Access check failed' });
      }
    };
  }

  canCreateItem() {
    return async (req, res, next) => {
      if (!req.body.authorized) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const userRoles = req.body.user.role || [];
      const hasBasicRole = userRoles.includes('basic') || 
                          userRoles.includes('admin') || 
                          userRoles.includes('superadmin');

      if (!hasBasicRole) {
        return res.status(403).json({ 
          message: 'Insufficient permissions to create items' 
        });
      }

      next();
    };
  }

  createItemAccessMiddleware() {
    return async (req, res, next) => {
      const originalJson = res.json;
      
      res.json = async function(data) {
        if (res.statusCode === 201 && data && data._id) {
          try {
            const itemType = req.itemType || 'room';
            const authService = req.app.get('authService');
            
            if (authService && authService.accessControl) {
              await authService.accessControl.createItemAccess({
                itemId: data._id,
                itemType,
                ownerId: req.body.user.id
              });
            }
          } catch (error) {
            console.error('Failed to create item access control:', error);
          }
        }
        
        originalJson.call(this, data);
      };
      
      next();
    };
  }

  async generateSignInLink(email, redirectUrl = '/', sendEmail = true) {
    try {
      const tokenData = {
        email,
        timestamp: Date.now(),
        redirectUrl,
        nonce: Math.random().toString(36).substring(2)
      };
      
      const authToken = Buffer.from(JSON.stringify(tokenData)).toString('base64url');
      const baseUrl = process.env.APP_URL || 'http://localhost:1041';
      const signInLinkUrl = `${baseUrl}/aovi/auth/verify-signin/${authToken}?redirect=${encodeURIComponent(redirectUrl)}`;
      
      const expiresAt = Date.now() + (5 * 60 * 1000);
      this.authTokens.set(authToken, {
        email,
        redirectUrl: redirectUrl.startsWith('/') ? baseUrl + redirectUrl : redirectUrl,
        expiresAt,
        used: false
      });
      
      this.cleanupExpiredTokens();
      
      let emailResult = { success: true, message: 'Email service not configured' };
      
      if (sendEmail && this.emailService.initialized) {
        emailResult = await this.emailService.sendSignInLink(email, signInLinkUrl, {
          redirectUrl,
          expiresIn: 5
        });
      }
      
      return {
        success: true,
        signin_link: signInLinkUrl,
        token: authToken,
        expires_in: 300,
        email,
        email_sent: emailResult.success,
        email_result: emailResult
      };
    } catch (error) {
      console.error('Error generating sign-in link:', error);
      return { success: false, error: error.message };
    }
  }

  async verifySignInLink(token) {
    try {
      const authTokenData = this.authTokens.get(token);
      
      if (!authTokenData) {
        throw new Error('Invalid or expired sign-in link');
      }
      
      if (Date.now() > authTokenData.expiresAt) {
        this.authTokens.delete(token);
        throw new Error('Sign-in link expired');
      }
      
      if (authTokenData.used) {
        throw new Error('Sign-in link already used');
      }
      
      authTokenData.used = true;
      this.authTokens.set(token, authTokenData);
      
      setTimeout(() => {
        this.authTokens.delete(token);
      }, 30000);
      
      return {
        success: true,
        email: authTokenData.email,
        user_id: `auth-user-${Buffer.from(authTokenData.email).toString('hex')}`,
        authenticated: true,
        redirect_url: authTokenData.redirectUrl
      };
    } catch (error) {
      console.error('Error verifying sign-in link:', error);
      return { success: false, error: error.message };
    }
  }

  cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of this.authTokens.entries()) {
      if (now > data.expiresAt) {
        this.authTokens.delete(token);
      }
    }
  }

  setAccessControl(accessControl) {
    this.accessControl = accessControl;
  }

  async generateMagicLink(email, redirectUrl, sendEmail) {
    return this.generateSignInLink(email, redirectUrl, sendEmail);
  }

  async verifyMagicLink(token) {
    return this.verifySignInLink(token);
  }
}

module.exports = KeycloakAuthService;