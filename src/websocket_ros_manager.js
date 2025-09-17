/**
 * @file WebSocket-based ROS manager with ROSLIB-compatible API
 * @author Peter Tan
 * 
 * This manager uses direct WebSocket communication with rosbridge_suite protocol
 * while maintaining compatibility with the existing ROSLIB.js API patterns.
 */

/**
 * Direct WebSocket implementation of ROS connection management
 * Compatible with rosbridge_suite protocol
 */
class WebSocketRos {
    constructor(options = {}) {
        this.url = options.url || 'ws://localhost:9090';
        this.socket = null;
        this.isConnected = false;
        this.messageId = 0;
        this.subscribers = new Map(); // topic -> {callbacks: Set, messageType: string}
        this.serviceCallbacks = new Map(); // id -> {resolve, reject}
        this.eventListeners = {
            connection: [],
            error: [],
            close: []
        };
        
        // Connection state
        this.connectingPromise = null;
        this.reconnectInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }

    /**
     * Connect to ROS bridge
     * @returns {Promise<void>}
     */
    connect() {
        if (this.isConnected) {
            return Promise.resolve();
        }

        if (this.connectingPromise) {
            return this.connectingPromise;
        }

        this.connectingPromise = new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(this.url);
                
                this.socket.onopen = () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.connectingPromise = null;
                    console.log(`WebSocket ROS connected to ${this.url}`);
                    
                    // Emit connection event
                    this.eventListeners.connection.forEach(callback => {
                        try { callback(); } catch (e) { console.error('Connection callback error:', e); }
                    });
                    
                    resolve();
                };

                this.socket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.socket.onerror = (event) => {
                    console.error(`WebSocket ROS error. Event type: ${event.type}.`, event);
                    this.connectingPromise = null;
                    
                    // Emit error event
                    this.eventListeners.error.forEach(callback => {
                        try { callback(event); } catch (e) { console.error('Error callback error:', e); }
                    });
                    
                    reject(new Error(`WebSocket connection failed. See browser console for event details.`));
                };

                this.socket.onclose = (event) => {
                    const wasConnected = this.isConnected;
                    this.isConnected = false;
                    this.connectingPromise = null;
                    
                    console.warn(`WebSocket ROS connection closed: ${event.code} - ${event.reason}`);
                    
                    // Emit close event
                    this.eventListeners.close.forEach(callback => {
                        try { callback(); } catch (e) { console.error('Close callback error:', e); }
                    });

                    // Attempt reconnection if we were previously connected
                    if (wasConnected && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.attemptReconnect();
                    }

                    if (!wasConnected) {
                        reject(new Error('Connection closed before establishing'));
                    }
                };

            } catch (error) {
                this.connectingPromise = null;
                reject(error);
            }
        });

        return this.connectingPromise;
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    attemptReconnect() {
        if (this.reconnectInterval) return;

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.reconnectInterval = setTimeout(() => {
            this.reconnectInterval = null;
            this.connect().catch(error => {
                console.error('Reconnection failed:', error);
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.attemptReconnect();
                }
            });
        }, delay);
    }

    /**
     * Handle incoming WebSocket messages
     * @param {string} data - Raw message data
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.topic && this.subscribers.has(message.topic)) {
                // Topic message
                const subscription = this.subscribers.get(message.topic);
                subscription.callbacks.forEach(callback => {
                    try {
                        callback(message.msg);
                    } catch (error) {
                        console.error(`Error in topic callback for ${message.topic}:`, error);
                    }
                });
            } else if (message.op === 'get_topics' && message.id && this.serviceCallbacks.has(message.id)) {
                // get_topics response from rosbridge protocol
                const { resolve, reject } = this.serviceCallbacks.get(message.id);
                this.serviceCallbacks.delete(message.id);
                
                resolve({
                    topics: message.topics || [],
                    types: message.types || []
                });
            } else if (message.id && this.serviceCallbacks.has(message.id)) {
                // Service response or get_topics response
                const { resolve, reject } = this.serviceCallbacks.get(message.id);
                this.serviceCallbacks.delete(message.id);
                
                // Check if this is actually a get_topics response without the op field
                if (message.topics && message.types) {
                    resolve({
                        topics: message.topics,
                        types: message.types
                    });
                } else if (message.op === 'service_response') {
                    // Handle rosapi service responses - data is in 'values' property
                    if (message.result === true && message.values) {
                        resolve(message.values);
                    } else if (message.result !== undefined) {
                        resolve(message.result);
                    } else {
                        reject(new Error(message.error || 'Service call failed'));
                    }
                } else if (message.result !== undefined) {
                    resolve(message.result);
                } else {
                    reject(new Error(message.error || 'Service call failed'));
                }
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error, data);
        }
    }

    /**
     * Send a message through the WebSocket
     * @param {object} message - Message to send
     */
    send(message) {
        if (!this.isConnected || !this.socket) {
            throw new Error('WebSocket is not connected');
        }
        
        this.socket.send(JSON.stringify(message));
    }

    /**
     * Subscribe to a topic
     * @param {string} topic - Topic name
     * @param {string} messageType - Message type
     * @param {function} callback - Callback function
     */
    subscribe(topic, messageType, callback) {
        if (!this.subscribers.has(topic)) {
            // First subscription to this topic
            this.subscribers.set(topic, {
                callbacks: new Set(),
                messageType: messageType
            });
            
            // Send subscription message to rosbridge
            this.send({
                op: 'subscribe',
                topic: topic,
                type: messageType
            });
        }
        
        this.subscribers.get(topic).callbacks.add(callback);
    }

    /**
     * Unsubscribe from a topic
     * @param {string} topic - Topic name
     * @param {function} callback - Specific callback to remove (optional)
     */
    unsubscribe(topic, callback = null) {
        if (!this.subscribers.has(topic)) return;
        
        const subscription = this.subscribers.get(topic);
        
        if (callback) {
            subscription.callbacks.delete(callback);
            
            // If no callbacks left, unsubscribe from topic
            if (subscription.callbacks.size === 0) {
                this.subscribers.delete(topic);
                this.send({
                    op: 'unsubscribe',
                    topic: topic
                });
            }
        } else {
            // Remove all callbacks and unsubscribe
            this.subscribers.delete(topic);
            this.send({
                op: 'unsubscribe',
                topic: topic
            });
        }
    }

    /**
     * Publish a message to a topic
     * @param {string} topic - Topic name
     * @param {string} messageType - Message type
     * @param {object} message - Message data
     */
    publish(topic, messageType, message) {
        this.send({
            op: 'publish',
            topic: topic,
            msg: message
        });
    }

    /**
     * Call a ROS service
     * @param {string} service - Service name
     * @param {string} serviceType - Service type
     * @param {object} request - Request data
     * @returns {Promise} Promise that resolves with service response
     */
    callService(service, serviceType, request = {}) {
        return new Promise((resolve, reject) => {
            const id = `service_call_${++this.messageId}`;
            
            this.serviceCallbacks.set(id, { resolve, reject });
            
            this.send({
                op: 'call_service',
                id: id,
                service: service,
                type: serviceType,
                args: request
            });
            
            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.serviceCallbacks.has(id)) {
                    this.serviceCallbacks.delete(id);
                    reject(new Error('Service call timeout'));
                }
            }, 10000);
        });
    }

    /**
     * Get list of topics
     * @returns {Promise} Promise that resolves with topics list
     */
    async getTopics() {
        try {
            // First try to get the topics list
            const topicsResult = await this.callService('/rosapi/topics', 'rosapi/Topics', {});
            
            if (topicsResult && topicsResult.topics && Array.isArray(topicsResult.topics)) {
                // Get types for each topic
                const types = [];
                for (const topic of topicsResult.topics) {
                    try {
                        const typeResult = await this.callService('/rosapi/topic_type', 'rosapi/TopicType', { topic: topic });
                        types.push(typeResult.type || 'unknown');
                    } catch (e) {
                        types.push('unknown');
                    }
                }
                
                return {
                    topics: topicsResult.topics,
                    types: types
                };
            } else {
                throw new Error('Invalid topics response format');
            }
        } catch (error) {
            console.error('rosapi topics failed, using discovery fallback:', error);
            return this.discoverTopics();
        }
    }

    async discoverTopics() {
        
        // Common ROS2 topic patterns to test
        const commonTopics = [
            '/cmd_vel',
            '/rosout',
            '/robot_description',
            '/tf',
            '/tf_static',
            '/scan',
            '/odom',
            '/imu',
            '/camera/image_raw',
            '/joint_states',
            '/parameter_events'
        ];
        
        const discoveredTopics = [];
        const discoveredTypes = [];
        
        // Test each common topic by trying to get its type
        for (const topic of commonTopics) {
            try {
                // Try to get topic type using a simple service call
                const typeResult = await this.callService('/rosapi/topic_type', 'rosapi/TopicType', { topic: topic });
                if (typeResult && typeResult.type) {
                    discoveredTopics.push(topic);
                    discoveredTypes.push(typeResult.type);
                }
            } catch (e) {
                // Topic doesn't exist or service not available
                continue;
            }
        }
        
        if (discoveredTopics.length > 0) {
            return {
                topics: discoveredTopics,
                types: discoveredTypes
            };
        }
        
        // Last resort: Return a minimal working set
        return {
            topics: ['/rosout', '/cmd_vel'],
            types: ['rcl_interfaces/msg/Log', 'geometry_msgs/Twist']
        };
    }

    async getTopicsViaRosapi() {
        try {
            console.log('Trying rosapi services as fallback...');
            
            // Try different rosapi service variations
            const serviceVariations = [
                { service: '/rosapi/topics', type: 'rosapi/Topics' },
                { service: '/rosapi/get_topics', type: 'rosapi/GetTopics' },
                { service: 'rosapi/topics', type: 'rosapi/Topics' }
            ];
            
            for (const variation of serviceVariations) {
                try {
                    console.log(`Trying service: ${variation.service} with type: ${variation.type}`);
                    const result = await this.callService(variation.service, variation.type, {});
                    console.log(`Service ${variation.service} response:`, result);
                    
                    if (result && result.topics && Array.isArray(result.topics)) {
                        // Get types for each topic
                        const types = [];
                        for (const topic of result.topics) {
                            try {
                                const typeResult = await this.callService('/rosapi/topic_type', 'rosapi/TopicType', { topic: topic });
                                types.push(typeResult.type || 'unknown');
                            } catch (e) {
                                types.push('unknown');
                            }
                        }
                        return {
                            topics: result.topics,
                            types: types
                        };
                    }
                } catch (e) {
                    console.log(`Service ${variation.service} failed:`, e);
                }
            }
            
            throw new Error('All rosapi service variations failed');
        } catch (error) {
            console.error('rosapi fallback failed:', error);
            throw error;
        }
    }

    /**
     * Get list of nodes (ROSLIB compatibility)
     * @param {function} callback - Callback function (for ROSLIB compatibility)
     * @returns {Promise} Promise that resolves with nodes list
     */
    getNodes(callback) {
        const promise = this.callService('/rosapi/nodes', 'rosapi/Nodes');
        if (callback) {
            promise.then(result => callback(result.nodes)).catch(error => callback([]));
        }
        return promise.then(result => result.nodes);
    }

    /**
     * Get node details (ROSLIB compatibility)
     * @param {string} node - Node name
     * @param {function} callback - Callback function (for ROSLIB compatibility)
     * @returns {Promise} Promise that resolves with node details
     */
    getNodeDetails(node, callback) {
        const promise = this.callService('/rosapi/node_details', 'rosapi/NodeDetails', { node: node });
        if (callback) {
            promise.then(result => callback(result)).catch(error => callback({}));
        }
        return promise;
    }

    /**
     * Add event listener (ROSLIB compatibility)
     * @param {string} event - Event name ('connection', 'error', 'close')
     * @param {function} callback - Event callback
     */
    on(event, callback) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].push(callback);
        }
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {function} callback - Event callback to remove
     */
    off(event, callback) {
        if (this.eventListeners[event]) {
            const index = this.eventListeners[event].indexOf(callback);
            if (index > -1) {
                this.eventListeners[event].splice(index, 1);
            }
        }
    }

    /**
     * Close the WebSocket connection
     */
    close() {
        if (this.reconnectInterval) {
            clearTimeout(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.isConnected = false;
        this.subscribers.clear();
        this.serviceCallbacks.clear();
    }
}

/**
 * ROSLIB-compatible Topic class using WebSocket
 */
class WebSocketTopic {
    constructor(options) {
        this.ros = options.ros;
        this.name = options.name;
        this.messageType = options.messageType;
        this.isSubscribed = false;
        this.callback = null;
    }

    /**
     * Subscribe to this topic
     * @param {function} callback - Message callback
     */
    subscribe(callback) {
        this.callback = callback;
        this.isSubscribed = true;
        this.ros.subscribe(this.name, this.messageType, callback);
    }

    /**
     * Unsubscribe from this topic
     */
    unsubscribe() {
        if (this.isSubscribed && this.callback) {
            this.ros.unsubscribe(this.name, this.callback);
            this.isSubscribed = false;
            this.callback = null;
        }
    }

    /**
     * Publish a message to this topic
     * @param {object} message - Message object (should have .data property for simple messages)
     */
    publish(message) {
        // Handle both WebSocketMessage and plain objects
        const messageData = message.data !== undefined ? message.data : message;
        this.ros.publish(this.name, this.messageType, messageData);
    }
}

/**
 * ROSLIB-compatible Message class
 */
class WebSocketMessage {
    constructor(data) {
        this.data = data;
    }
}

/**
 * ROSLIB-compatible Service class
 */
class WebSocketService {
    constructor(options) {
        this.ros = options.ros;
        this.name = options.name;
        this.serviceType = options.serviceType;
    }

    /**
     * Call the service
     * @param {object} request - Service request
     * @param {function} callback - Success callback
     * @param {function} failedCallback - Error callback
     */
    callService(request, callback, failedCallback) {
        this.ros.callService(this.name, this.serviceType, request)
            .then(result => callback && callback(result))
            .catch(error => failedCallback && failedCallback(error));
    }
}

/**
 * Enhanced WebSocket ROS Connection Manager
 * Maintains the same API as the original RosConnectionManager but uses WebSocket directly
 */
class WebSocketRosConnectionManager {
    constructor() {
        this.connections = {}; // keyed by com_port
        this.subscriptions = {}; // keyed by com_port
    }

    /**
     * Get a WebSocket ROS connection
     * @param {string} com_port - WebSocket URL
     * @param {number} timeout - Connection timeout (for compatibility, not used)
     * @returns {Promise<WebSocketRos>}
     */
    async getConnection(com_port, timeout = 3000) {
        // If a connection object for this port already exists
        if (this.connections[com_port]) {
            const connection = this.connections[com_port];
            
            // If it's already connected, return it immediately
            if (connection.isConnected) {
                return connection;
            }
            
            // If it's in the process of connecting, wait for the connection to complete
            if (connection.connectingPromise) {
                await connection.connectingPromise;
                // After waiting, it should be connected. Return it.
                return connection;
            }
        }

        // If no connection object exists or it's in a weird state, create a new one.
        const ros = new WebSocketRos({ url: com_port });
        this.connections[com_port] = ros;
        
        // Initialize subscriptions for this connection
        if (!this.subscriptions[com_port]) {
            this.subscriptions[com_port] = {};
        }

        // Set up connection cleanup
        ros.on('close', () => {
            delete this.connections[com_port];
            delete this.subscriptions[com_port];
        });

        // Start the connection process and wait for it to complete
        await ros.connect();
        return ros;
    }

    /**
     * Subscribe to a topic with multiple callback support
     * @param {string} com_port - WebSocket URL
     * @param {string} topicName - Topic name
     * @param {string} messageType - Message type
     * @param {function} callback - Message callback
     */
    async subscribe(com_port, topicName, messageType, callback) {
        const ros = await this.getConnection(com_port);
        const subGroup = this.subscriptions[com_port];

        if (!subGroup[topicName]) {
            subGroup[topicName] = {
                callbacks: new Set(),
                messageType: messageType
            };
            
            // Subscribe to the topic with a combined callback
            ros.subscribe(topicName, messageType, (message) => {
                subGroup[topicName].callbacks.forEach(cb => {
                    try { cb(message); } catch (e) { console.error('Callback error:', e); }
                });
            });
        }

        subGroup[topicName].callbacks.add(callback);
    }

    /**
     * Unsubscribe from a topic
     * @param {string} com_port - WebSocket URL
     * @param {string} topicName - Topic name
     * @param {function} callback - Specific callback to remove
     */
    unsubscribe(com_port, topicName, callback) {
        const subGroup = this.subscriptions[com_port];
        if (subGroup && subGroup[topicName]) {
            subGroup[topicName].callbacks.delete(callback);

            // If no callbacks left, unsubscribe from the topic
            if (subGroup[topicName].callbacks.size === 0) {
                const ros = this.connections[com_port];
                if (ros) {
                    ros.unsubscribe(topicName);
                }
                delete subGroup[topicName];
            }
        }
    }

    /**
     * Publish a message
     * @param {string} com_port - WebSocket URL
     * @param {string} topicName - Topic name
     * @param {string} messageType - Message type
     * @param {object} message - Message data
     */
    async publish(com_port, topicName, messageType, message) {
        const ros = await this.getConnection(com_port);
        ros.publish(topicName, messageType, message);
    }

    /**
     * Get topics list
     * @param {string} com_port - WebSocket URL
     * @returns {Promise<object>}
     */
    async getTopics(com_port) {
        try {
            const ros = await this.getConnection(com_port);
            const result = await ros.getTopics();
            return result;
        } catch (error) {
            console.error('Failed to get topics for', com_port, ':', error);
            throw error;
        }
    }

    /**
     * Ping-pong test for connectivity
     * @param {string} com_port - WebSocket URL
     * @param {string} pingTopicName - Ping topic
     * @param {string} pongTopicName - Pong topic
     * @returns {Promise<string>}
     */
    async pingPong(com_port, pingTopicName, pongTopicName) {
        const ros = await this.getConnection(com_port);

        return new Promise((resolve, reject) => {
            let timeoutId;

            const pongCallback = (message) => {
                clearTimeout(timeoutId);
                ros.unsubscribe(pongTopicName, pongCallback);

                try {
                    const msg = typeof message === 'string' ? JSON.parse(message) : message;
                    
                    // Handle nested JSON structure: parse msg.data if it exists and is a string
                    let statusObj = msg;
                    if (msg.data && typeof msg.data === 'string') {
                        statusObj = JSON.parse(msg.data);
                    }
                    
                    console.log('🔍 Parsed status object:', statusObj);
                    console.log('🔍 statusObj.status:', statusObj.status);
                    
                    if (statusObj.status === "OK_WAITING") {
                        resolve("OK_WAITING");
                    } else {
                        resolve("OK");
                    }
                } catch (parseError) {
                    console.error('🔍 Parse error:', parseError);
                    reject("MSG_FRMT_ERR");
                }
            };

            // Subscribe to pong topic
            ros.subscribe(pongTopicName, "std_msgs/String", pongCallback);

            // Set timeout
            timeoutId = setTimeout(() => {
                ros.unsubscribe(pongTopicName, pongCallback);
                reject("TIMEOUT_ERR");
            }, 3000);

            // Send ping
            ros.publish(pingTopicName, "std_msgs/String", { data: "ping" });
        });
    }
}

// Create global instance
const webSocketRosManager = new WebSocketRosConnectionManager();

// Export classes and manager for use
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        WebSocketRos,
        WebSocketTopic,
        WebSocketMessage,
        WebSocketService,
        WebSocketRosConnectionManager,
        webSocketRosManager
    };
} else {
    // Browser environment - attach to window
    window.WebSocketRos = WebSocketRos;
    window.WebSocketTopic = WebSocketTopic;
    window.WebSocketMessage = WebSocketMessage;
    window.WebSocketService = WebSocketService;
    window.WebSocketRosConnectionManager = WebSocketRosConnectionManager;
    window.webSocketRosManager = webSocketRosManager;
}