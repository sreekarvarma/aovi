# Keycloak Configuration

## Setup Instructions

1. **Copy the template file:**
   ```bash
   cp keycloak/import/aovi-realm.template.json keycloak/import/aovi-realm.json
   ```

2. **Edit the copied file and replace:**
   - `CHANGE_THIS_PASSWORD_IN_PRODUCTION` with a secure password
   - `REPLACE_WITH_SECURE_CLIENT_SECRET` with a secure client secret

3. **For development, you can use:**
   - Password: `admin123` (change for production)
   - Client Secret: `aovi-client-secret-dev` (change for production)

## Security Note

The `aovi-realm.json` file is gitignored to prevent accidental commits of secrets.

## Realm Configuration

This Keycloak realm provides:
- **Role-based access control** (superadmin, admin, basic)
- **Email-based authentication**
- **Password reset capabilities**
- **Client configuration** for AOVI app integration