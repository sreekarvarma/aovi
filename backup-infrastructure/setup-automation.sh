#!/bin/bash

#######################################
# Setup Automated Remote Backup
# Configures cron job for daily/weekly backups
#######################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/remote-backup.sh"

echo -e "${GREEN}=== Remote Backup Automation Setup ===${NC}"
echo

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

echo "Choose backup frequency:"
echo "1) Daily (at 2 AM)"
echo "2) Weekly (Sunday at 2 AM)"
echo "3) Custom cron expression"
echo "4) Manual only (no automation)"
echo
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        CRON_SCHEDULE="0 2 * * *"
        DESCRIPTION="Daily at 2 AM"
        ;;
    2)
        CRON_SCHEDULE="0 2 * * 0"
        DESCRIPTION="Weekly on Sunday at 2 AM"
        ;;
    3)
        echo "Enter cron expression (e.g., '0 3 * * *' for daily at 3 AM):"
        read -p "Cron: " CRON_SCHEDULE
        DESCRIPTION="Custom: $CRON_SCHEDULE"
        ;;
    4)
        echo -e "${YELLOW}No automation configured. Run manually with:${NC}"
        echo "  $BACKUP_SCRIPT"
        exit 0
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

# Remove existing cron job for this script if any
crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" | crontab - 2>/dev/null || true

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_SCHEDULE $BACKUP_SCRIPT >> $SCRIPT_DIR/backup.log 2>&1") | crontab -

echo -e "${GREEN}✓ Cron job configured successfully!${NC}"
echo
echo "Schedule: $DESCRIPTION"
echo "Command: $BACKUP_SCRIPT"
echo "Logs: $SCRIPT_DIR/backup.log"
echo
echo "To view scheduled jobs: crontab -l"
echo "To remove automation: crontab -e (and delete the line)"
echo
echo -e "${YELLOW}Test the backup now with:${NC}"
echo "  $BACKUP_SCRIPT"
