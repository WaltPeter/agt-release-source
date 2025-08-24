/**
 * TypeScript definitions for Simplified Robot Module Interface
 */

export interface RosAPI {
    connect(url?: string): Promise<any>;
    publish(topic: string, messageType: string, data: any): boolean;
    subscribe(topic: string, messageType: string, callback: (message: any) => void): any;
    unsubscribe(topic: string): boolean;
    getTopicList(): Promise<string[]>;
    isConnected(): boolean;
}

export interface DataAPI {
    // Local configuration (not persisted)
    getLocalConfig(): Record<string, any>;
    setLocalConfig(updates: Record<string, any>): void;
    
    // Persistent configuration
    loadConfig(): Record<string, any>;
    saveConfig(): boolean;
}

export interface ContextAPI {
    // Module State Management
    isEnabled(): boolean;
    enable(): boolean;
    disable(): boolean;
    
    // Robot Context Access
    getComPort(): string;
    getRobotNamespace(): string;
    getRobotType(): string;
    getRobotName(): string;
    getRobotConfig(): Record<string, any>;
    
    // Helper Functions
    showConnectionError(comPort?: string): void;
}

export interface InitConfig {
    moduleName: string;
    robotConfig?: {
        com_port?: string;
        namespace?: string;
        type?: string;
        name?: string;
    };
    moduleConfig?: Record<string, any>;
}

export interface ModuleInterface {
    // Initialization - REQUIRED
    init(config: InitConfig): ModuleInterface;
    
    ros: RosAPI;
    data: DataAPI;
    context: ContextAPI;
}

declare global {
    interface Window {
        MODULE_INTERFACE: ModuleInterface;
    }
}

export {};
