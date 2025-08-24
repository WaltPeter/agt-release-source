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
        if (data == null || data === '') { 
            console.log("Robot list not found in localStorage, returning empty robot list."); 
            return {};
        } else {
            return JSON.parse(data);
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