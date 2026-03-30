import React, { useState, useEffect } from 'react';

// Example React component using the Simplified Robot Module Interface
// This example matches the Complete React Example from CDN_MODULE_API.md
function SimpleSprayerControl() {
    const [pressure, setPressure] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [sensorData, setSensorData] = useState({});

    useEffect(() => {
        // REQUIRED: Initialize with development configuration
        MODULE_INTERFACE.init({
            moduleName: 'sprayer_module_v2_2',
            robotConfig: {
                com_port: 'ws://localhost:9090',
                namespace: 'test_robot',
                type: 'ranger1s',
                name: 'Development Robot'
            },
            moduleConfig: {
                is_enabled: true,
                pressure_setpoint: 50
            }
        });

        // Load saved configuration
        const config = MODULE_INTERFACE.data.loadConfig();
        setPressure(config.pressure_setpoint || 50);

        // Connect to ROS
        MODULE_INTERFACE.ros.connect()
            .then(() => {
                setIsConnected(true);
                console.log('Connected to robot');
            })
            .catch(error => {
                console.error('Connection failed:', error);
            });

        // Subscribe to pressure updates
        MODULE_INTERFACE.ros.subscribe('/sprayer/pressure', 'std_msgs/Float32', (message) => {
            setSensorData(prev => ({ ...prev, pressure: message.data }));
        });

        // Subscribe to tank level updates
        MODULE_INTERFACE.ros.subscribe('/sprayer/tank_level', 'std_msgs/Float32', (message) => {
            setSensorData(prev => ({ ...prev, tank_level: message.data }));
        });
    }, []);

    const handlePressureChange = (newPressure) => {
        setPressure(newPressure);
        
        // Update current config then save to persistent storage
        MODULE_INTERFACE.data.setConfig({ pressure_setpoint: newPressure });
        MODULE_INTERFACE.data.saveConfig();
        
        // Publish command to robot
        MODULE_INTERFACE.ros.publish('/sprayer/command', 'std_msgs/String', {
            data: `SET_PRESSURE,${newPressure}`
        });
    };

    const startSpray = () => {
        MODULE_INTERFACE.ros.publish('/sprayer/command', 'std_msgs/String', {
            data: `START_SPRAY,${pressure},5000`
        });
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>Simple Sprayer Control</h1>
            
            <div>
                <strong>Status: </strong>
                <span style={{ color: isConnected ? 'green' : 'red' }}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                </span>
            </div>

            <div style={{ margin: '20px 0' }}>
                <h3>Tank Level: {sensorData.tank_level?.toFixed(1) || 0}%</h3>
                <h3>Current Pressure: {sensorData.pressure?.toFixed(1) || 0} PSI</h3>
            </div>

            <div style={{ margin: '20px 0' }}>
                <h3>Set Pressure: {pressure} PSI</h3>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={pressure}
                    onChange={(e) => handlePressureChange(parseInt(e.target.value))}
                    style={{ width: '200px' }}
                />
            </div>

            <button 
                onClick={startSpray}
                disabled={!isConnected}
                style={{ 
                    padding: '10px 20px',
                    backgroundColor: isConnected ? '#4CAF50' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px'
                }}
            >
                Start Spray (5 seconds)
            </button>
        </div>
    );
}

export default SimpleSprayerControl;
