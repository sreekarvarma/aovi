const { ItemAccess, AccessRequest } = require('./models/access.model');

class AccessControlService {
  constructor() {
    this.ItemAccess = ItemAccess;
    this.AccessRequest = AccessRequest;
    this.initialized = true;
  }

  async createItemAccess(itemId, itemType, ownerId, createdBy = ownerId, permissions = {}) {
    if (!this.initialized) return null;
    
    const defaultPermissions = {
      public: { read: false, write: false, delete: false },
      roles: {
        basic: { read: true, write: false, delete: false },
        admin: { read: true, write: true, delete: false },
        superadmin: { read: true, write: true, delete: true }
      },
      users: []
    };
    
    const itemAccess = new this.ItemAccess({
      itemId,
      itemType,
      ownerId,
      created_by: createdBy,
      permissions: { ...defaultPermissions, ...permissions }
    });
    
    return await itemAccess.save();
  }
  
  async checkPermission(userId, itemId, action, userRoles = []) {
    if (!this.initialized) {
      return { granted: true, reason: 'Fallback access' };
    }

    try {
      const access = await this.ItemAccess.findOne({ itemId });
      if (!access) {
        return { granted: false, reason: 'No permission' };
      }
      
      // Owner has full access
      if (access.ownerId === userId) {
        return { granted: true, reason: 'Owner' };
      }
      
      // Check public permissions
      if (access.permissions.public?.[action]) {
        return { granted: true, reason: 'Public' };
      }
      
      // Check role permissions
      if (userRoles && userRoles.length > 0) {
        for (const role of userRoles) {
          if (access.permissions.roles?.[role]?.[action]) {
            return { granted: true, reason: `Role: ${role}` };
          }
        }
      }
      
      // Check user-specific permissions
      const userPerm = access.permissions.users.find(u => u.userId === userId);
      if (userPerm?.[action]) {
        return { granted: true, reason: 'User-specific' };
      }
      
      return { granted: false, reason: 'Access denied' };
      
    } catch (error) {
      return { granted: false, reason: 'Permission error' };
    }
  }

  async requestAccess(userId, itemId, requestedPermissions, reason = '', itemType = 'document', requesterEmail = null) {
    if (!this.initialized) return null;
    
    // First get the item's access control to find the owner
    const itemAccess = await this.ItemAccess.findOne({ itemId });
    if (!itemAccess) {
      throw new Error('Item access control not found');
    }
    
    const permissions = {
      read: requestedPermissions.includes('read'),
      write: requestedPermissions.includes('write'),
      delete: requestedPermissions.includes('delete')
    };

    const accessRequest = new this.AccessRequest({
      itemId,
      itemType: itemType || itemAccess.itemType,
      requesterId: userId,
      requesterEmail: requesterEmail,
      ownerId: itemAccess.ownerId,
      requestedPermissions: permissions,
      reason
    });

    return await accessRequest.save();
  }

  async getPendingRequests() {
    if (!this.initialized) return [];
    return await this.AccessRequest.find({ status: 'pending' });
  }

  async processAccessRequest(requestId, action, adminId, adminNote = '') {
    if (!this.initialized) return null;
    
    const request = await this.AccessRequest.findById(requestId);
    if (!request) throw new Error('Request not found');

    request.status = action === 'approve' ? 'approved' : 'denied';
    request.response = {
      message: adminNote,
      decided_by: adminId,
      decided_at: new Date()
    };

    return await request.save();
  }

  async grantDirectAccess(userId, itemId, permissions, adminId) {
    if (!this.initialized) return null;
    
    const access = await this.ItemAccess.findOne({ itemId });
    if (!access) throw new Error('Item access not found');

    const userPerm = {
      userId,
      read: permissions.includes('read'),
      write: permissions.includes('write'),
      delete: permissions.includes('delete'),
      granted_by: adminId,
      granted_at: new Date()
    };

    access.permissions.users.push(userPerm);
    return await access.save();
  }

  async revokeAccess(userId, itemId, permissions = []) {
    if (!this.initialized) return null;
    
    const access = await this.ItemAccess.findOne({ itemId });
    if (!access) throw new Error('Item access not found');

    access.permissions.users = access.permissions.users.filter(
      user => user.userId !== userId
    );

    return await access.save();
  }
}

module.exports = AccessControlService;
