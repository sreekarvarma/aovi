const mongoose = require('mongoose');

const ITEM_TYPES = ['room', 'comment', 'event', 'document', 'transcription', 'geodata'];
const DEFAULT_REQUEST_EXPIRY_DAYS = 7;

const permissionSchema = {
  read: { type: Boolean, default: false },
  write: { type: Boolean, default: false },
  delete: { type: Boolean, default: false }
};

const itemAccessSchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true,
    index: true
  },
  
  itemType: {
    type: String,
    required: true,
    enum: ITEM_TYPES,
    index: true
  },
  
  ownerId: {
    type: String,
    required: true,
    index: true
  },
  
  permissions: {
    public: permissionSchema,
    
    roles: {
      basic: { ...permissionSchema, read: { type: Boolean, default: true } },
      admin: { ...permissionSchema, read: { type: Boolean, default: true }, write: { type: Boolean, default: true } },
      superadmin: {
        read: { type: Boolean, default: true },
        write: { type: Boolean, default: true },
        delete: { type: Boolean, default: true }
      }
    },
    
    users: [{
      userId: { type: String, required: true },
      ...permissionSchema,
      granted_by: { type: String },
      granted_at: { type: Date, default: Date.now }
    }]
  },
  
  inherits_from: {
    type: String,
    default: null
  },
  
  created_by: { type: String, required: true },
  
  privacy: {
    soft_delete: { type: Boolean, default: false },
    retention_days: { type: Number, default: null },
    anonymize_after_days: { type: Number, default: null }
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

itemAccessSchema.index({ itemId: 1, itemType: 1 }, { unique: true });
itemAccessSchema.index({ ownerId: 1 });
itemAccessSchema.index({ 'permissions.users.userId': 1 });

const accessRequestSchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true,
    index: true
  },
  
  itemType: {
    type: String,
    required: true,
    enum: ITEM_TYPES
  },
  
  requesterId: { type: String, required: true },
  requesterEmail: { type: String, required: true },
  ownerId: { type: String, required: true },
  
  requestedPermissions: {
    ...permissionSchema,
    read: { type: Boolean, default: true }
  },
  
  reason: { type: String, maxlength: 500 },
  
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied', 'expired'],
    default: 'pending',
    index: true
  },
  
  response: {
    message: { type: String, maxlength: 500 },
    decided_by: { type: String },
    decided_at: { type: Date }
  },
  
  expires_at: { 
    type: Date, 
    default: () => new Date(Date.now() + DEFAULT_REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000) 
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

accessRequestSchema.index({ requesterId: 1 });
accessRequestSchema.index({ ownerId: 1 });
accessRequestSchema.index({ status: 1 });
accessRequestSchema.index({ expires_at: 1 });

module.exports = {
  ItemAccess: mongoose.model('ItemAccess', itemAccessSchema),
  AccessRequest: mongoose.model('AccessRequest', accessRequestSchema)
};