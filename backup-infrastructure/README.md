# Remote Database Backup

Automated backup solution for MongoDB and PostgreSQL databases to a remote server via SSH.

## Prerequisites

Before running backups, you **MUST** complete these steps:

1. **Remote server accessible via SSH**
2. **SSH key-based authentication configured**
3. **Docker containers running**: `aovi-mongodb` and `aovi-postgres`
4. **Sufficient disk space on remote server**

---

## Setup Instructions (Run Once)

### Step 1: Configure Remote Server Details

Open `remote-backup.sh` in an editor:
```bash
nano remote-backup.sh
```

**Find lines 13-16 and update with YOUR values:**

```bash
REMOTE_USER="backup"                    # ← Change to your SSH username
REMOTE_HOST="backup.example.com"        # ← Change to your server IP/hostname
REMOTE_PATH="/backups/aovi"             # ← Change to your backup directory path
SSH_KEY="$HOME/.ssh/id_rsa"             # ← Change if using different SSH key
```

**Example:**
```bash
REMOTE_USER="ubuntu"
REMOTE_HOST="192.168.1.100"
REMOTE_PATH="/home/ubuntu/backups"
SSH_KEY="$HOME/.ssh/id_rsa"
```

Save and exit (Ctrl+X, Y, Enter in nano).

### Step 2: Setup SSH Key Authentication

**A. Generate SSH key (if you don't have one):**
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
# Press Enter for all prompts (no passphrase recommended for automation)
```

**B. Copy SSH key to remote server:**
```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub YOUR_USER@YOUR_SERVER
# Replace YOUR_USER and YOUR_SERVER with actual values
```

Example:
```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@192.168.1.100
```

**C. Test SSH connection (IMPORTANT):**
```bash
ssh YOUR_USER@YOUR_SERVER
# You should login WITHOUT password prompt
# Type 'exit' to logout
```

If password is requested, SSH key setup failed - repeat Step 2B.

### Step 3: Create Backup Directory on Remote Server

```bash
ssh YOUR_USER@YOUR_SERVER "mkdir -p /path/to/backups"
```

Example:
```bash
ssh ubuntu@192.168.1.100 "mkdir -p /home/ubuntu/backups"
```

### Step 4: Test Manual Backup

```bash
cd /Users/sreekarvarma/UN/aovi/backup-infrastructure
./remote-backup.sh
```

**Expected output:**
```
[INFO] Starting remote backup process...
[INFO] Creating temporary backup directory...
[INFO] Backing up MongoDB database...
[INFO] MongoDB backup completed
[INFO] Backing up PostgreSQL database...
[INFO] PostgreSQL backup completed
[INFO] Creating backup metadata...
[INFO] Creating remote backup directory...
[INFO] Transferring backups to remote server...
[INFO] Verifying remote backup...
[INFO] ✓ Backup successfully transferred to remote server
[INFO] Remote location: user@host:/path/YYYY-MM-DD
[INFO] Cleaning up old backups on remote server...
[INFO] ✓ Backup process completed successfully!
```

---

## 🤖 Automated Backups

**Current Status:**  Daily backups configured at 2:00 AM

### View Scheduled Jobs
```bash
crontab -l
```

### Change Schedule
```bash
./setup-automation.sh
```

Options:
- **Daily** (2 AM) - Recommended for production
- **Weekly** (Sunday 2 AM) - For low-change environments
- **Custom** - Specify your own cron schedule
- **Manual only** - Disable automation

### View Backup Logs
```bash
# View recent logs
tail -50 backup-infrastructure/backup.log

# Monitor live
tail -f backup-infrastructure/backup.log
```

### Disable Automated Backups
```bash
crontab -e
# Delete the line containing "remote-backup.sh"
# Save and exit
```

---

## What Gets Backed Up

| Database | Container | Content | Format |
|----------|-----------|---------|--------|
| MongoDB | `aovi-mongodb` | `aovi` database | Compressed archive (.gz) |
| PostgreSQL | `aovi-postgres` | `keycloak` database | Custom format dump |
| Metadata | - | Backup info & timestamp | Text file |

**Backup Structure on Remote Server:**
```
/your/backup/path/
├── 2025-10-21/
│   ├── mongodb-2025-10-21_02-00-00.archive.gz
│   ├── postgresql-2025-10-21_02-00-00.dump
│   └── backup-info.txt
├── 2025-10-22/
│   └── ...
```

**Retention:** Old backups (>7 days) are automatically deleted.

---

## Restore Backups

### List Available Backups
```bash
ssh YOUR_USER@YOUR_SERVER "ls -lh /path/to/backups/"
```

### Restore MongoDB
```bash
# 1. Copy backup from remote server
scp YOUR_USER@YOUR_SERVER:/path/to/backups/2025-10-21/mongodb-*.archive.gz /tmp/

# 2. Copy to MongoDB container
docker cp /tmp/mongodb-*.archive.gz aovi-mongodb:/tmp/restore.archive.gz

# 3. Restore (WARNING: This will replace current data!)
docker exec aovi-mongodb mongorestore \
    --archive=/tmp/restore.archive.gz \
    --gzip \
    --drop
```

### Restore PostgreSQL
```bash
# 1. Copy backup from remote server
scp YOUR_USER@YOUR_SERVER:/path/to/backups/2025-10-21/postgresql-*.dump /tmp/

# 2. Copy to PostgreSQL container
docker cp /tmp/postgresql-*.dump aovi-postgres:/tmp/restore.dump

# 3. Restore (WARNING: This will replace current data!)
docker exec -e PGPASSWORD="${KEYCLOAK_DB_PASSWORD:-keycloak}" aovi-postgres \
    pg_restore -U keycloak -d keycloak -c /tmp/restore.dump
```

---

## 🔧 Troubleshooting

### "Cannot connect to remote server"

**Problem:** SSH connection failed

**Solutions:**
1. **Verify remote server is accessible:**
   ```bash
   ping YOUR_SERVER
   ```

2. **Check SSH key permissions:**
   ```bash
   chmod 600 ~/.ssh/id_rsa
   chmod 644 ~/.ssh/id_rsa.pub
   ```

3. **Test SSH connection manually:**
   ```bash
   ssh -i ~/.ssh/id_rsa YOUR_USER@YOUR_SERVER
   ```
   - Should login WITHOUT password
   - If it asks for password, run: `ssh-copy-id -i ~/.ssh/id_rsa.pub YOUR_USER@YOUR_SERVER`

4. **Check SSH key path in script:**
   ```bash
   ls -l ~/.ssh/id_rsa  # Should exist
   ```

---

### "Container 'aovi-mongodb' is not running"

**Problem:** Database containers are stopped

**Solution:**
```bash
cd /Users/sreekarvarma/UN/aovi
docker-compose up -d
docker ps  # Verify containers are running
```

---

### "Permission denied" on Remote Server

**Problem:** No write access to backup directory

**Solution:**
```bash
# Create directory with proper permissions
ssh YOUR_USER@YOUR_SERVER "mkdir -p /path/to/backups && chmod 755 /path/to/backups"
```

---

### Cron Job Not Running

**Check if cron job exists:**
```bash
crontab -l | grep remote-backup
```

**Check system logs:**
```bash
# macOS
log show --predicate 'eventMessage contains "cron"' --last 1h

# View backup script logs
cat backup-infrastructure/backup.log
```

**Test backup manually:**
```bash
./remote-backup.sh
```

---

## 🔒 Security Features

- SSH key-based authentication (passwordless)
- Automatic cleanup of old backups (7-day retention)
- Backups stored on separate server (disaster recovery)
- Docker internal network for database access
- No credentials stored in plain text

---

## 📋 System Requirements

| Component | Requirement |
|-----------|-------------|
| **Local** | Docker, Docker Compose, SSH client |
| **Remote** | SSH server, sufficient disk space |
| **Containers** | `aovi-mongodb`, `aovi-postgres` (running) |
| **Network** | SSH port 22 accessible to remote server |

---

## 📞 Quick Reference

```bash
# Run backup manually
./remote-backup.sh

# Setup automation
./setup-automation.sh

# View scheduled jobs
crontab -l

# View logs
tail -f backup-infrastructure/backup.log

# List backups on remote server
ssh YOUR_USER@YOUR_SERVER "ls -lh /path/to/backups/"

# Check containers
docker ps | grep aovi
```
