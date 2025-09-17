/**
 * Simplified Robot Module Interface
 * Version: 1.0.0
 * 
 * Provides only essential APIs:
 * - ROS communication (connect, publish, subscribe, getTopicList)
 * - Data management (local config, persistent config, sensor data updates)
 */

(function(global) {
    'use strict';

    // Check if we're running in a browser environment
    if (typeof window === 'undefined') {
        console.warn('Robot Module Interface requires a browser environment');
        return;
    }

    // Prevent multiple initialization
    if (window.MODULE_INTERFACE) {
        console.warn('Robot Module Interface already initialized');
        return;
    }

    /**
     * Simplified Module Interface
     */
    class ModuleInterface {
        constructor(options = {}) {
            this.options = {
                moduleName: options.moduleName || 'robot-module',
                ...options
            };

            this.state = {
                connected: false
            };

            this.ros = null;
            this.subscribers = new Map();
            this.publishers = new Map();
            this.initialized = false;
            
            this.setupGlobalInterface();
        }

        setupGlobalInterface() {
            // Create the simplified global MODULE_INTERFACE object
            window.MODULE_INTERFACE = {
                // Initialization - REQUIRED for integration mode
                init: (config) => this.init(config),
                
                // ROS Communication API
                ros: {
                    connect: (url) => this.connect(url),
                    publish: (topic, messageType, data) => this.publish(topic, messageType, data),
                    subscribe: (topic, messageType, callback) => this.subscribe(topic, messageType, callback),
                    unsubscribe: (topic) => this.unsubscribe(topic),
                    disconnect: () => this.disconnect(),
                    getTopicList: () => this.getTopicList(),
                    isConnected: () => this.state.connected
                },

                // Data Management API
                data: {
                    // Configuration management (all stored in robot_list)
                    getConfig: () => this.getConfig(),
                    setConfig: (updates) => this.setConfig(updates),
                    
                    // Persistent configuration - proper load/save cycle
                    loadConfig: () => this.loadConfig(),
                    saveConfig: () => this.saveConfig()
                },
                
                // Module & Robot Context API
                context: {
                    // Module State Management (with internal persistence)
                    isEnabled: () => this.isModuleEnabled(),
                    enable: () => this.enableModule(),
                    disable: () => this.disableModule(),
                    
                    // Robot Context Access
                    getComPort: () => this.getComPort(),
                    getRobotNamespace: () => this.getRobotNamespace(),
                    getRobotType: () => this.getRobotType(),
                    getRobotName: () => this.getRobotName(),
                    getRobotConfig: () => this.getRobotConfig(),
                    
                    // Helper Functions
                    showConnectionError: (comPort) => this.showConnectionError(comPort)
                }
            };
        }

        // Initialize the module interface with module-specific configuration
        init(config = {}) {
            if (!config.moduleName) {
                throw new Error('MODULE_INTERFACE.init() requires moduleName parameter');
            }
            
            // Store only the module name - everything else goes to robot_list
            this.options.moduleName = config.moduleName;
            
            
            // Write provided configuration to robot_list (any mode)
            if (config.robotConfig || config.moduleConfig) {
                this.writeConfigToRobotList(config);
            }
            
            this.initialized = true;
            console.log(`MODULE_INTERFACE initialized for module: ${this.options.moduleName}`);
            
            return this;
        }

        // ROS Communication Methods
        async connect(websocketUrl) {
            try {
                const url = websocketUrl || this.getComPort();
                
                // Check if we're in integration mode with existing ROS connection
                if (typeof window !== 'undefined' && window.rosManager) {
                    // Use existing rosManager (production mode)
                    this.ros = await window.rosManager.getConnection(url);
                    this.state.connected = true;
                } else {
                    // Development mode - use WebSocketRosConnectionManager
                    if (!window.webSocketRosManager) {
                        throw new Error('WebSocketRosConnectionManager not available');
                    }
                    this.ros = await window.webSocketRosManager.getConnection(url);
                    this.state.connected = true;
                }
                
                return this.ros;
            } catch (error) {
                console.error('Failed to connect to ROS:', error);
                throw error;
            }
        }

        publish(topicName, messageType, data) {
            if (!this.ros || !this.state.connected) {
                console.warn('Not connected to ROS');
                return false;
            }

            try {
                // Use the appropriate connection manager
                const manager = (typeof window !== 'undefined' && window.rosManager) ? 
                    window.rosManager : window.webSocketRosManager;
                
                if (manager) {
                    // Use connection manager (both production and development)
                    manager.publish(this.getComPort(), topicName, messageType, data);
                    return true;
                } else {
                    console.error('No ROS manager available');
                    return false;
                }
            } catch (error) {
                console.error('Failed to publish message:', error);
                return false;
            }
        }

        subscribe(topicName, messageType, callback) {
            if (!this.ros || !this.state.connected) {
                console.warn('Not connected to ROS');
                return null;
            }

            try {
                // Use the appropriate connection manager
                const manager = (typeof window !== 'undefined' && window.rosManager) ? 
                    window.rosManager : window.webSocketRosManager;
                
                if (manager) {
                    // Use connection manager (both production and development)
                    return manager.subscribe(this.getComPort(), topicName, messageType, callback);
                } else {
                    console.error('No ROS manager available');
                    return null;
                }
            } catch (error) {
                console.error('Failed to create subscription:', error);
                return null;
            }
        }

        unsubscribe(topicName) {
            const subscriber = this.subscribers.get(topicName);
            if (subscriber) {
                subscriber.unsubscribe();
                this.subscribers.delete(topicName);
                return true;
            }
            return false;
        }

        // Safe disconnect - only affects this module's subscriptions
        disconnect() {
            console.log(`MODULE_INTERFACE: Disconnecting module ${this.moduleName} from all topics`);
            
            // Unsubscribe from all topics for this module
            const topics = Array.from(this.subscribers.keys());
            let unsubscribedCount = 0;
            
            topics.forEach(topicName => {
                if (this.unsubscribe(topicName)) {
                    unsubscribedCount++;
                }
            });
            
            console.log(`MODULE_INTERFACE: Unsubscribed from ${unsubscribedCount} topics`);
            
            // Clear subscriber map
            this.subscribers.clear();
            
            // Note: WebSocket connection remains open for other components
            console.log('MODULE_INTERFACE: Module disconnected (WebSocket connection preserved for other components)');
            
            return true;
        }

        getTopicList() {
            if (!this.ros || !this.state.connected) {
                return Promise.resolve([]);
            }

            try {
                // Use the appropriate connection manager
                const manager = (typeof window !== 'undefined' && window.rosManager) ? 
                    window.rosManager : window.webSocketRosManager;
                
                if (manager && manager.getTopics) {
                    return manager.getTopics(this.getComPort())
                        .then(result => result.topics || [])
                        .catch(error => {
                            console.error('Failed to get topics:', error);
                            return [];
                        });
                } else {
                    console.warn('getTopics not available');
                    return Promise.resolve([]);
                }
            } catch (error) {
                console.error('Failed to get topic list:', error);
                return Promise.resolve([]);
            }
        }

        // Write configuration directly to robot_list (any mode)
        writeConfigToRobotList(config) {
            if (typeof window === 'undefined') return;
            
            // Initialize robot_list if not exists
            if (!window.robot_list) {
                window.robot_list = {};
            }
            
            // Write robot configuration if provided
            if (config.robotConfig) {
                const robotName = config.robotConfig.name || 'development_robot';
                
                // Always write the robot config (overwrite existing)
                window.robot_list[robotName] = {
                    ...window.robot_list[robotName],
                    robot_type: config.robotConfig.type || 'ranger1s',
                    namespace: config.robotConfig.namespace || 'test_robot',
                    com_port: config.robotConfig.com_port || 'ws://localhost:9090',
                    modules: window.robot_list[robotName]?.modules || {}
                };
                
                // Write module configuration if provided
                if (config.moduleConfig) {
                    window.robot_list[robotName].modules[this.options.moduleName] = {
                        ...config.moduleConfig
                    };
                }
            } else if (config.moduleConfig) {
                // Only module config provided - use current robot name
                const robotName = this.getRobotName();
                if (window.robot_list[robotName]) {
                    window.robot_list[robotName].modules[this.options.moduleName] = {
                        ...config.moduleConfig
                    };
                }
            }
        }

        // Data Management Methods - all operations on robot_list
        getConfig() {
            try {
                const robotName = this.getRobotName();
                const moduleName = this.getModuleName();
                
                if (typeof window !== 'undefined' && window.robot_list && 
                    window.robot_list[robotName] && 
                    window.robot_list[robotName].modules && 
                    window.robot_list[robotName].modules[moduleName]) {
                    return { ...window.robot_list[robotName].modules[moduleName] };
                }
                
                return {};
            } catch (error) {
                console.error('Failed to get config:', error);
                return {};
            }
        }

        setConfig(updates) {
            try {
                const robotName = this.getRobotName();
                const moduleName = this.getModuleName();
                
                if (typeof window !== 'undefined' && window.robot_list) {
                    // Ensure robot_list structure exists
                    if (!window.robot_list[robotName]) {
                        window.robot_list[robotName] = { modules: {} };
                    }
                    if (!window.robot_list[robotName].modules) {
                        window.robot_list[robotName].modules = {};
                    }
                    if (!window.robot_list[robotName].modules[moduleName]) {
                        window.robot_list[robotName].modules[moduleName] = {};
                    }
                    
                    // Update the robot_list configuration
                    Object.assign(window.robot_list[robotName].modules[moduleName], updates);
                    
                    return true;
                }
                
                return false;
            } catch (error) {
                console.error('Failed to set config:', error);
                return false;
            }
        }

        saveConfig() {
            try {
                if (typeof window !== 'undefined' && window.robot_list) {
                    this.writeToRobotListStorage();
                    return true;
                }
                
                console.warn('No robot_list available to save');
                return false;
            } catch (error) {
                console.error('Failed to save config:', error);
                return false;
            }
        }

        writeToRobotListStorage() {
            try {
                // Use the bundled write_to_robot_list_storage function
                if (typeof window !== 'undefined' && window.write_to_robot_list_storage) {
                    window.write_to_robot_list_storage();
                    return;
                }
                
                // Fallback if bundled function not available
                console.warn('write_to_robot_list_storage function not available');
            } catch (error) {
                console.error('Failed to save robot_list:', error);
            }
        }

        loadConfig() {
            try {
                // Load configuration from persistent storage and update current working config
                const persistentConfig = this.loadPersistentConfig();
                
                // Update the current working configuration in robot_list
                if (Object.keys(persistentConfig).length > 0) {
                    this.setConfig(persistentConfig);
                }
                
                return this.getConfig(); // Return the now-updated config
            } catch (error) {
                console.error('Failed to load config:', error);
                return this.getConfig(); // Fallback to current config
            }
        }

        getModuleName() {
            if (!this.initialized) {
                console.warn('MODULE_INTERFACE not initialized. Call MODULE_INTERFACE.init({ moduleName: "your_module" }) first.');
                return this.options.moduleName; // fallback
            }
            return this.options.moduleName;
        }

        loadPersistentConfig() {
            try {
                // Use the bundled load_robot_list_from_storage function
                if (typeof window !== 'undefined' && window.load_robot_list_from_storage) {
                    const robot_list = window.load_robot_list_from_storage();
                    
                    // Determine mode based on available globals (production has window.panel)
                    const isProductionMode = (typeof window !== 'undefined' && 
                                            window.panel && 
                                            window.panel.active_panel);
                    
                    if (isProductionMode) {
                        // Production mode - read from robot_list structure
                        const robotName = window.panel.active_panel.name;
                        const moduleName = this.getModuleName();
                        
                        const moduleConfig = (robot_list[robotName] && 
                                            robot_list[robotName].modules && 
                                            robot_list[robotName].modules[moduleName]) ? 
                                            robot_list[robotName].modules[moduleName] : {};
                        
                        return moduleConfig;
                } else {
                    // Development mode - extract module config from loaded robot_list
                    try {
                        // Update window.robot_list if it exists
                        if (window.robot_list) {
                            Object.assign(window.robot_list, robot_list);
                        }
                        
                        // Extract module config - in development, use first robot or create default
                        const robotName = this.getRobotName();
                        const moduleName = this.getModuleName();
                        
                        if (robot_list[robotName] && 
                            robot_list[robotName].modules && 
                            robot_list[robotName].modules[moduleName]) {
                            return robot_list[robotName].modules[moduleName];
                        }
                    } catch (parseError) {
                        console.error('Failed to parse stored robot_list:', parseError);
                    }
                    
                    return {};
                }
                } else {
                    // Fallback if bundled function not available
                    console.warn('load_robot_list_from_storage function not available');
                    return {};
                }
            } catch (error) {
                console.error('Failed to load persistent config:', error);
                return {};
            }
        }

        savePersistentConfig() {
            try {
                // Save current local config to persistent storage
                const configToSave = { ...this.state.localConfig };
                
                // Determine mode based on available globals (production has window.panel)
                const isProductionMode = (typeof window !== 'undefined' && 
                                        window.panel && 
                                        window.panel.active_panel);
                
                if (isProductionMode) {
                    // Production mode - write to robot_list structure
                    const robotName = window.panel.active_panel.name;
                    const moduleName = this.getModuleName();
                    const robotList = window.robot_list || {};
                    
                    // Ensure robot_list structure exists
                    if (!robotList[robotName]) robotList[robotName] = {};
                    if (!robotList[robotName].modules) robotList[robotName].modules = {};
                    if (!robotList[robotName].modules[moduleName]) robotList[robotName].modules[moduleName] = {};
                    
                    // Update the robot_list structure (merge with existing)
                    Object.assign(robotList[robotName].modules[moduleName], configToSave);
                    
                    // Persist to storage via main app function
                    if (typeof window.write_to_robot_list_file === 'function') {
                        window.write_to_robot_list_file();
                    } else {
                        console.warn('write_to_robot_list_file function not available');
                    }
                } else {
                    // Development mode - write to localStorage
                    const moduleName = this.getModuleName();
                    const storageKey = `robot-module-config-${moduleName}`;
                    localStorage.setItem(storageKey, JSON.stringify(configToSave));
                }
                
                return true;
            } catch (error) {
                console.error('Failed to save persistent config:', error);
                return false;
            }
        }


        // Module State Management Methods - all operations on robot_list
        isModuleEnabled() {
            try {
                const robotName = this.getRobotName();
                const moduleName = this.getModuleName();
                
                if (typeof window !== 'undefined' && window.robot_list && 
                    window.robot_list[robotName] && 
                    window.robot_list[robotName].modules && 
                    window.robot_list[robotName].modules[moduleName]) {
                    return window.robot_list[robotName].modules[moduleName].is_enabled || false;
                }
                
                return false;
            } catch (error) {
                console.error('Failed to check module enabled state:', error);
                return false;
            }
        }

        enableModule() {
            try {
                // Priority 1: Update options moduleConfig if available
                if (this.options.moduleConfig) {
                    this.options.moduleConfig.is_enabled = true;
                }
                
                // Priority 2: Production mode - robot_list
                if (typeof window !== 'undefined' && window.panel && window.panel.active_panel) {
                    const robotName = window.panel.active_panel.name;
                    const moduleName = this.getModuleName();
                    const robotList = window.robot_list || {};
                    
                    if (!robotList[robotName]) robotList[robotName] = {};
                    if (!robotList[robotName].modules) robotList[robotName].modules = {};
                    if (!robotList[robotName].modules[moduleName]) robotList[robotName].modules[moduleName] = {};
                    
                    robotList[robotName].modules[moduleName].is_enabled = true;
                    
                    // Save to storage
                    if (typeof window.write_to_robot_list_storage === 'function') {
                        window.write_to_robot_list_storage();
                    }
                    
                    // Update UI if toggle exists
                    const toggle = document.querySelector(`#is_enabled_${moduleName}`);
                    if (toggle) toggle.checked = true;
                    
                    return true;
                }
                
                return false;
            } catch (error) {
                console.error('Failed to enable module:', error);
                return false;
            }
        }

        disableModule() {
            try {
                // Priority 1: Update options moduleConfig if available
                if (this.options.moduleConfig) {
                    this.options.moduleConfig.is_enabled = false;
                }
                
                // Priority 2: Production mode - robot_list
                if (typeof window !== 'undefined' && window.panel && window.panel.active_panel) {
                    const robotName = window.panel.active_panel.name;
                    const moduleName = this.getModuleName();
                    const robotList = window.robot_list || {};
                    
                    if (robotList[robotName] && robotList[robotName].modules && robotList[robotName].modules[moduleName]) {
                        robotList[robotName].modules[moduleName].is_enabled = false;
                        
                        // Save to storage
                        if (typeof window.write_to_robot_list_storage === 'function') {
                            window.write_to_robot_list_storage();
                        }
                        
                        // Update UI if toggle exists
                        const toggle = document.querySelector(`#is_enabled_${moduleName}`);
                        if (toggle) toggle.checked = false;
                        
                        return true;
                    }
                }
                
                return false;
            } catch (error) {
                console.error('Failed to disable module:', error);
                return false;
            }
        }

        // Robot Context Access Methods - all read from robot_list
        getComPort() {
            try {
                const robotName = this.getRobotName();
                
                if (typeof window !== 'undefined' && window.robot_list && window.robot_list[robotName]) {
                    return window.robot_list[robotName].com_port || 'ws://localhost:9090';
                }
                
                return 'ws://localhost:9090';
            } catch (error) {
                console.error('Failed to get COM port:', error);
                return 'ws://localhost:9090';
            }
        }

        getRobotNamespace() {
            try {
                const robotName = this.getRobotName();
                
                if (typeof window !== 'undefined' && window.robot_list && window.robot_list[robotName]) {
                    return window.robot_list[robotName].namespace || '';
                }
                
                return '';
            } catch (error) {
                console.error('Failed to get robot namespace:', error);
                return '';
            }
        }

        getRobotType() {
            try {
                const robotName = this.getRobotName();
                
                if (typeof window !== 'undefined' && window.robot_list && window.robot_list[robotName]) {
                    return window.robot_list[robotName].robot_type || '';
                }
                
                return '';
            } catch (error) {
                console.error('Failed to get robot type:', error);
                return '';
            }
        }

        getRobotName() {
            try {
                // Priority 1: Production mode - active panel
                if (typeof window !== 'undefined' && window.panel && window.panel.active_panel) {
                    return window.panel.active_panel.name || '';
                }
                
                // Priority 2: Development mode - find first robot in robot_list
                if (typeof window !== 'undefined' && window.robot_list) {
                    const robotNames = Object.keys(window.robot_list);
                    if (robotNames.length > 0) {
                        return robotNames[0];
                    }
                }
                
                // Priority 3: Fallback
                return 'development_robot';
            } catch (error) {
                console.error('Failed to get robot name:', error);
                return 'development_robot';
            }
        }

        getRobotConfig() {
            try {
                const robotName = this.getRobotName();
                
                if (typeof window !== 'undefined' && window.robot_list && window.robot_list[robotName]) {
                    return { ...window.robot_list[robotName] };
                }
                
                return {};
            } catch (error) {
                console.error('Failed to get robot config:', error);
                return {};
            }
        }

        // Helper Methods
        showConnectionError(comPort) {
            const port = comPort || this.getComPort();
            if (typeof window !== 'undefined' && window.Dialog) {
                const d = new window.Dialog("alertbox", "Connection Error", 
                    `Failed to establish connection to <br>${port}.`, 250, 91);
                const cancelBtn = d.dialog.querySelector("#cancel-btn");
                if (cancelBtn) {
                    cancelBtn.parentElement.removeChild(cancelBtn);
                }
                const okBtn = d.dialog.querySelector("#ok-btn");
                if (okBtn) {
                    okBtn.style.marginLeft = "calc((50% + 4px) / 2)";
                }
                d.show();
            } else {
                console.error(`Connection failed: ${port}`);
                alert(`Failed to establish connection to ${port}`);
            }
        }

    }

    // Initialize the interface
    new ModuleInterface();

    console.log('✅ Simplified Robot Module Interface initialized');

})(typeof window !== 'undefined' ? window : this);