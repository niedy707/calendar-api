#!/bin/bash

# Define paths (Relative to calendar-api/scripts or root)
# If running via npm run sync-logic from root, CWD is calendar-api
# But if script uses relative paths from CWD, it needs to be correct.

# We assume running from calendar-api project root:
SOURCE_DIR="src/lib"
PANEL_DEST="../panel/src/lib"
TAKVIM_DEST="../takvim/lib"

# Files to sync
FILES=("classification.ts")

echo "Starting synchronization of classification logic..."

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Source directory $SOURCE_DIR not found! Please run this script from the project root using 'npm run sync-logic'."
    exit 1
fi

for file in "${FILES[@]}"; do
    SRC_FILE="$SOURCE_DIR/$file"
    
    # Sync to Panel
    if [ -d "$PANEL_DEST" ]; then
        if [ -f "$PANEL_DEST/$file" ]; then
             cp "$SRC_FILE" "$PANEL_DEST/"
             echo "✅ Synced $file to Panel ($PANEL_DEST)"
        else
             echo "⚠️  Panel destination directory exists but file not found to overwrite? Overwriting anyway."
             cp "$SRC_FILE" "$PANEL_DEST/"
             echo "✅ Synced $file to Panel ($PANEL_DEST)"
        end
        fi
    else
        echo "⚠️  Panel destination $PANEL_DEST not found, skipping..."
    fi

    # Sync to Takvim
    if [ -d "$TAKVIM_DEST" ]; then
        cp "$SRC_FILE" "$TAKVIM_DEST/"
        echo "✅ Synced $file to Takvim ($TAKVIM_DEST)"
    else
        echo "⚠️  Takvim destination $TAKVIM_DEST not found, skipping..."
    fi
done

echo "Synchronization complete!"
