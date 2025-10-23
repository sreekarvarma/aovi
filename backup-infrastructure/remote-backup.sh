#!/bin/bash

#######################################
# Remote Database Backup Script
# Backs up MongoDB & PostgreSQL to a remote server
#######################################

set -e  # Exit on any error

# ===== CONFIGURATION =====
REMOTE_USER="backup"                               # SSH user on remote server
REMOTE_HOST="backup.example.com"                   # Remote server hostname/IP
REMOTE_PATH="/home/<user>/backups/aovi"            # Remote backup directory
SSH_KEY="$HOME/.ssh/id_rsa"                        # SSH private key path

BACKUP_DIR="/tmp/aovi-backup-$(date +%Y%m%d_%H%M%S)"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Container names
MONGO_CONTAINER="aovi-mongodb"
POSTGRES_CONTAINER="aovi-postgres"

# ===== COLORS FOR OUTPUT =====
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ===== FUNCTIONS =====
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

cleanup() {
    if [ -d "$BACKUP_DIR" ]; then
        log_info "Cleaning up temporary backup directory..."
        rm -rf "$BACKUP_DIR"
    fi
}

trap cleanup EXIT

# ===== PRE-FLIGHT CHECKS =====
log_info "Starting remote backup process..."

# Check if containers are running
if ! docker ps | grep -q "$MONGO_CONTAINER"; then
    log_error "MongoDB container '$MONGO_CONTAINER' is not running"
    exit 1
fi

if ! docker ps | grep -q "$POSTGRES_CONTAINER"; then
    log_error "PostgreSQL container '$POSTGRES_CONTAINER' is not running"
    exit 1
fi

# Check SSH connectivity
if ! ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=5 "$REMOTE_USER@$REMOTE_HOST" "echo 2>&1" > /dev/null 2>&1; then
    log_error "Cannot connect to remote server $REMOTE_HOST"
    log_error "Please ensure:"
    log_error "  1. Remote server is accessible"
    log_error "  2. SSH key is set up correctly"
    log_error "  3. SSH key path is correct: $SSH_KEY"
    exit 1
fi

# ===== CREATE BACKUP DIRECTORY =====
log_info "Creating temporary backup directory..."
mkdir -p "$BACKUP_DIR"

# ===== BACKUP MONGODB =====
log_info "Backing up MongoDB database..."
docker exec "$MONGO_CONTAINER" mongodump \
    --db=aovi \
    --archive=/tmp/mongodb-backup.archive \
    --gzip

docker cp "$MONGO_CONTAINER:/tmp/mongodb-backup.archive" \
    "$BACKUP_DIR/mongodb-${DATE}.archive.gz"

docker exec "$MONGO_CONTAINER" rm /tmp/mongodb-backup.archive

log_info "MongoDB backup completed"

# ===== BACKUP POSTGRESQL =====
log_info "Backing up PostgreSQL database..."

# Get PostgreSQL password from environment or .env file
if [ -f ".env" ]; then
    export $(grep KEYCLOAK_DB_PASSWORD .env | xargs)
fi

docker exec -e PGPASSWORD="${KEYCLOAK_DB_PASSWORD:-keycloak}" "$POSTGRES_CONTAINER" \
    pg_dump -U keycloak -d keycloak -F c -f /tmp/postgresql-backup.dump

docker cp "$POSTGRES_CONTAINER:/tmp/postgresql-backup.dump" \
    "$BACKUP_DIR/postgresql-${DATE}.dump"

docker exec "$POSTGRES_CONTAINER" rm /tmp/postgresql-backup.dump

log_info "PostgreSQL backup completed"

# ===== CREATE METADATA =====
log_info "Creating backup metadata..."
cat > "$BACKUP_DIR/backup-info.txt" << EOF
Backup Date: $(date)
MongoDB Database: aovi
PostgreSQL Database: keycloak
MongoDB Container: $MONGO_CONTAINER
PostgreSQL Container: $POSTGRES_CONTAINER
Hostname: $(hostname)
EOF

# ===== TRANSFER TO REMOTE SERVER =====
log_info "Creating remote backup directory..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
    "mkdir -p $REMOTE_PATH/$(date +%Y-%m-%d)"

log_info "Transferring backups to remote server..."
scp -i "$SSH_KEY" -r "$BACKUP_DIR/"* \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/$(date +%Y-%m-%d)/"

# ===== VERIFY TRANSFER =====
log_info "Verifying remote backup..."
REMOTE_FILES=$(ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
    "ls -1 $REMOTE_PATH/$(date +%Y-%m-%d) | wc -l")

if [ "$REMOTE_FILES" -ge 3 ]; then
    log_info "✓ Backup successfully transferred to remote server"
    log_info "Remote location: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/$(date +%Y-%m-%d)"
else
    log_error "Backup transfer verification failed"
    exit 1
fi

# ===== CLEANUP OLD BACKUPS (Keep last 7 days) =====
log_info "Cleaning up old backups on remote server..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
    "find $REMOTE_PATH -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true"

log_info "✓ Backup process completed successfully!"
