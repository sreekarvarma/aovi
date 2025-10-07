const express = require('express');
const AccessControlService = require('./access-control.service');

function createAccessControlRouter() {
  const router = express.Router();
  const accessControl = new AccessControlService();

  // Simple authentication middleware
  const requireAuth = (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    next();
  };

  // Test endpoint
  router.get('/test', (req, res) => {
    res.json({
      success: true,
      message: 'Access control operational',
      initialized: accessControl.initialized
    });
  });

  // Create item access control
  router.post('/items', requireAuth, async (req, res) => {
    try {
      const { itemId, itemType, ownerId } = req.body;
      const createdBy = req.session.user.id;

      if (!itemId || !itemType || !ownerId) {
        return res.status(400).json({
          success: false,
          message: 'itemId, itemType, and ownerId are required'
        });
      }

      const result = await accessControl.createItemAccess(itemId, itemType, ownerId, createdBy);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create item access control',
        error: error.message
      });
    }
  });

    // Check permission for item
  router.get('/items/:itemId/check/:action', requireAuth, async (req, res) => {
    try {
      const { itemId, action } = req.params;
      const userId = req.session.user.id;
      const userRoles = req.session.user.roles || [];

      const hasPermission = await accessControl.checkPermission(userId, itemId, action, userRoles);
      
      res.json({
        success: true,
        hasPermission,
        user: userId,
        item: itemId,
        action
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to check permission',
        error: error.message
      });
    }
  });

    // Request access to an item
  router.post('/requests', requireAuth, async (req, res) => {
    try {
      const { itemId, requestedPermissions, reason, itemType } = req.body;
      const userId = req.session.user.id;
      const userEmail = req.session.user.email;

      if (!itemId || !requestedPermissions || !Array.isArray(requestedPermissions)) {
        return res.status(400).json({
          success: false,
          message: 'itemId and requestedPermissions array are required'
        });
      }

      const result = await accessControl.requestAccess(userId, itemId, requestedPermissions, reason, itemType, userEmail);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create access request',
        error: error.message
      });
    }
  });

    // Get pending access requests (for administrators)
  router.get('/requests/pending', requireAuth, async (req, res) => {
    try {
      const userRoles = req.session.user.roles || [];

      // Check if user has admin role
      const isAdmin = userRoles.includes('admin') || userRoles.includes('superadmin');
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const requests = await accessControl.getPendingRequests();
      res.json({ success: true, data: requests || [] });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get pending requests',
        error: error.message
      });
    }
  });

    // Approve or deny access request
  router.put('/requests/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { action, adminNote } = req.body;
      const adminId = req.session.user.id;
      const userRoles = req.session.user.roles || [];

      // Check if user has admin role
      const isAdmin = userRoles.includes('admin') || userRoles.includes('superadmin');
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      if (!action || !['approve', 'deny'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'action must be either "approve" or "deny"'
        });
      }

      const result = await accessControl.processAccessRequest(id, action, adminId, adminNote);
      res.json({
        success: true,
        message: `Access request ${action}d`,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to process access request',
        error: error.message
      });
    }
  });

    // Grant direct access (for administrators)
  router.post('/grants', requireAuth, async (req, res) => {
    try {
      const { userId, itemId, permissions } = req.body;
      const adminId = req.session.user.id;
      const userRoles = req.session.user.roles || [];

      // Check if user has admin role
      const isAdmin = userRoles.includes('admin') || userRoles.includes('superadmin');
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      if (!userId || !itemId || !permissions || !Array.isArray(permissions)) {
        return res.status(400).json({
          success: false,
          message: 'userId, itemId, and permissions array are required'
        });
      }

      const result = await accessControl.grantDirectAccess(userId, itemId, permissions, adminId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to grant direct access',
        error: error.message
      });
    }
  });

  // Revoke access (for administrators)
  router.delete('/grants', requireAuth, async (req, res) => {
    try {
      const { userId, itemId, permissions } = req.body;
      const adminId = req.session.user.id;
      const userRoles = req.session.user.roles || [];

      // Check if user has admin role
      const isAdmin = userRoles.includes('admin') || userRoles.includes('superadmin');
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      if (!userId || !itemId) {
        return res.status(400).json({
          success: false,
          message: 'userId and itemId are required'
        });
      }

      const result = await accessControl.revokeAccess(userId, itemId, permissions);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to revoke access',
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createAccessControlRouter;