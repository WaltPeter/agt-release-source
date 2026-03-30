/**
 * Robot List Loader Manager
 * Handles loading robot configurations from localStorage with migration support
 */

async function migrateFromFileToLocalStorage() {
    // Try to migrate existing file-based configuration to localStorage
    // This is a one-time migration for existing users
    if (localStorage.getItem("robot_list_migrated")) {
        return false; // Already migrated
    }
    
    try {
        if (typeof readUserFileContent === 'function') {
            const fileData = await readUserFileContent("config/robot_list.json");
            if (fileData && fileData !== '') {
                console.log("Migrating robot configuration from file to localStorage...");
                localStorage.setItem("robot_list", fileData);
                localStorage.setItem("robot_list_migrated", "true");
                console.log("Migration completed successfully");
                return true;
            }
        }
    } catch (error) {
        console.log("No file migration needed or file read failed:", error.message);
    }
    
    localStorage.setItem("robot_list_migrated", "true");
    return false;
}

function load_robot_list_from_storage() {
    try {
        const data = localStorage.getItem("robot_list");
        console.log("🔍 DEBUG: Raw robot_list data from localStorage:", data);
        if (data == null || data === '') { 
            console.log("Robot list not found in localStorage, returning empty robot list."); 
            return {};
        } else {
            const parsed = JSON.parse(data);
            console.log("🔍 DEBUG: Parsed robot_list:", parsed);
            
            // Clean up corrupted, deprecated, and invalid module references
            let hasChanges = false;
            for (const [robotName, robotConfig] of Object.entries(parsed)) {
                if (!robotConfig.modules) continue;
                
                // Get robot type to check against available modules
                const robotType = robotConfig.robot_type || 'ranger1s';
                const availableModules = LIST_MODULE[robotType] || {};
                
                // Check each module in robot config
                const moduleNames = Object.keys(robotConfig.modules);
                for (const moduleName of moduleNames) {
                    let shouldRemove = false;
                    let reason = '';
                    
                    // Check for specific known corrupted modules
                    if (moduleName === 'robot-module') {
                        shouldRemove = true;
                        reason = 'corrupted module name';
                    }
                    // Check for deprecated modules
                    else if (DEPRECATED_MODULES.includes(moduleName)) {
                        shouldRemove = true;
                        reason = 'deprecated module';
                    }
                    // Check for modules with invalid characters
                    else if (!/^[a-zA-Z0-9_]+$/.test(moduleName)) {
                        shouldRemove = true;
                        reason = 'invalid module name format';
                    }
                    // Check if module exists in registry
                    else if (!availableModules[moduleName]) {
                        shouldRemove = true;
                        reason = 'module not found in registry';
                    }
                    // Check if module config is valid
                    else if (typeof robotConfig.modules[moduleName] !== 'object' || robotConfig.modules[moduleName] === null) {
                        shouldRemove = true;
                        reason = 'invalid module configuration';
                    }
                    
                    if (shouldRemove) {
                        console.log(`🧹 CLEANUP: Removing ${moduleName} from robot ${robotName} (${reason})`);
                        delete robotConfig.modules[moduleName];
                        hasChanges = true;
                    }
                }
                
                // Clean up empty modules object
                if (Object.keys(robotConfig.modules).length === 0) {
                    robotConfig.modules = {};
                }
            }
            
            // Save cleaned data back to localStorage if changes were made
            if (hasChanges) {
                console.log("🧹 CLEANUP: Saving cleaned robot list to localStorage");
                localStorage.setItem("robot_list", JSON.stringify(parsed, null, 2));
            }
            
            return parsed;
        } 
    } catch (error) {
        console.error("Failed to load robot list from storage:", error);
        return {};
    }
}

async function load_robot_list_with_migration() {
    await migrateFromFileToLocalStorage();
    return load_robot_list_from_storage();
}

// Export for module systems (if available)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        load_robot_list_from_storage, 
        load_robot_list_with_migration,
        migrateFromFileToLocalStorage 
    };
}

// Make globally available
if (typeof window !== 'undefined') {
    window.load_robot_list_from_storage = load_robot_list_from_storage;
    window.load_robot_list_with_migration = load_robot_list_with_migration;
    window.migrateFromFileToLocalStorage = migrateFromFileToLocalStorage;
}