const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      const smtpConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      };
      
      this.transporter = nodemailer.createTransport(smtpConfig);
      this.initialized = true;
      
      // Test connection
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('SMTP connection failed:', error);
          this.initialized = false;
        } else {
          console.log('SMTP server connection established successfully');
        }
      });
      
    } catch (error) {
      console.error('Failed to initialize email service:', error);
      this.initialized = false;
    }
  }

  async sendSignInLink(email, signInLink, options = {}) {
    if (!this.initialized) {
      throw new Error('Email service not initialized');
    }

    try {
      const language = options.language || 'en';
      const subject = this.getTranslatedSubject(language);
      
      const mailOptions = {
        from: `"AOVI" <${process.env.SMTP_USER}>`,
        to: email,
        subject: subject,
        html: this.generateSignInTemplate(email, signInLink, options),
        text: this.generateTextTemplate(email, signInLink, options)
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: info.messageId,
        message: 'Sign-in link sent successfully'
      };
    } catch (error) {
      console.error('Failed to send sign-in link email:', error.message);
      throw error;
    }
  }

  generateSignInTemplate(email, signInLink, options = {}) {
    const expiresIn = options.expiresIn || 5;
    const language = options.language || 'en';
    const t = this.getTranslations(language);
    
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AOVI Sign-in Link</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: 500; }
        .warning { background: #fff3cd; color: #856404; padding: 12px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${t.title}</h1>
        <p>${t.greeting}</p>
        
        <p style="text-align: center; margin: 30px 0;">
            <a href="${signInLink}" class="button">${t.button}</a>
        </p>
        
        <div class="warning">
            ⚠️ ${t.expires} ${expiresIn} ${t.minutes}
        </div>
        
        <p style="color: #666; font-size: 14px;">
            ${t.fallback} ${signInLink}
        </p>
        
        <p style="color: #666; font-size: 14px;">
            ${t.ignore}
        </p>
    </div>
</body>
</html>`;
  }

  /**
   * Generate plain text email template for sign-in link
   */
  generateTextTemplate(email, signInLink, options = {}) {
    const expiresIn = options.expiresIn || 5;
    const language = options.language || 'en';
    const t = this.getTranslations(language);
    
    return `${t.title}

${t.greeting}

${signInLink}

${t.expires} ${expiresIn} ${t.minutes}

${t.ignore}

---
${t.footer}`;
  }

  getTranslatedSubject(language) {
    const subjects = {
      'en': 'Your AOVI Sign-in Link',
      'pt': 'Seu Link de Acesso AOVI',
      'fr': 'Votre Lien de Connexion AOVI',
      'de': 'Ihr AOVI Anmelde-Link'
    };
    return subjects[language] || subjects['en'];
  }

  getTranslations(language) {
    const translations = {
      'en': {
        title: '🔗 AOVI Sign-in Link',
        greeting: 'Hello! You requested a secure sign-in link for AOVI.',
        button: 'Sign In to AOVI',
        expires: 'This link expires in',
        minutes: 'minutes and can only be used once.',
        fallback: 'If the button doesn\'t work, copy this link:',
        ignore: 'If you didn\'t request this, you can safely ignore this email.',
        footer: 'AOVI'
      },
      'pt': {
        title: '🔗 Link de Acesso AOVI',
        greeting: 'Olá! Você solicitou um link de acesso seguro para AOVI.',
        button: 'Entrar no AOVI',
        expires: 'Este link expira em',
        minutes: 'minutos e só pode ser usado uma vez.',
        fallback: 'Se o botão não funcionar, copie este link:',
        ignore: 'Se você não solicitou isso, pode ignorar este email com segurança.',
        footer: 'AOVI'
      },
      'fr': {
        title: '🔗 Lien de Connexion AOVI',
        greeting: 'Bonjour! Vous avez demandé un lien de connexion sécurisé pour AOVI.',
        button: 'Se Connecter à AOVI',
        expires: 'Ce lien expire dans',
        minutes: 'minutes et ne peut être utilisé qu\'une seule fois.',
        fallback: 'Si le bouton ne fonctionne pas, copiez ce lien :',
        ignore: 'Si vous n\'avez pas demandé ceci, vous pouvez ignorer cet email en toute sécurité.',
        footer: 'AOVI'
      },
      'de': {
        title: '🔗 AOVI Anmelde-Link',
        greeting: 'Hallo! Sie haben einen sicheren Anmelde-Link für AOVI angefordert.',
        button: 'Bei AOVI anmelden',
        expires: 'Dieser Link läuft ab in',
        minutes: 'Minuten und kann nur einmal verwendet werden.',
        fallback: 'Falls der Button nicht funktioniert, kopieren Sie diesen Link:',
        ignore: 'Falls Sie dies nicht angefordert haben, können Sie diese E-Mail sicher ignorieren.',
        footer: 'AOVI'
      }
    };
    return translations[language] || translations['en'];
  }

  getStatus() {
    return {
      initialized: this.initialized,
      transporter: this.transporter ? 'configured' : 'not configured'
    };
  }
}

module.exports = EmailService;
