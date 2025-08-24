/**
 * Robot List Storage Manager
 * Handles saving and loading robot configurations to/from localStorage
 */

function write_to_robot_list_storage() {
    try {
        localStorage.setItem("robot_list", JSON.stringify(robot_list, null, 2));
        console.log("Robot list saved to localStorage successfully");
    } catch (error) {
        console.error("Failed to save robot list to localStorage:", error);
        alert("Failed to save robot configuration. Changes may not be preserved.");
    }
}

// Export for module systems (if available)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { write_to_robot_list_storage };
}

// Make globally available
if (typeof window !== 'undefined') {
    window.write_to_robot_list_storage = write_to_robot_list_storage;
}