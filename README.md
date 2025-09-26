# AGT Studio - Robot Module Interface CDN

This repository hosts the CDN-ready files for the AGT Studio Robot Module Interface.

## 🚀 CDN Usage

### Via GitHub Pages (Production CDN)

```html
<!-- Include the main interface -->
<script src="https://waltpeter.github.io/agt-release-source/dist/robot-module-interface.min.js"></script>

<!-- Your module code -->
<script>
  // Initialize with development configuration
  MODULE_INTERFACE.init({
    moduleName: 'your_module_name',
    robotConfig: {
      com_port: 'ws://localhost:9090',
      namespace: 'test_robot',
      type: 'ranger1s',
      name: 'Development Robot'
    },
    moduleConfig: {
      is_enabled: true,
      // Your custom parameters
    }
  });
  
  // Use the API
  MODULE_INTERFACE.ros.connect();
</script>
```

## 📦 Package Contents

- `module-interface.js` - Main CDN script with all dependencies bundled
- `dist/` - Minified distribution files
- `src/` - Individual source components
- `examples/` - Usage examples (React & Vanilla JS)
- `types/` - TypeScript definitions

## 🔧 Development Workflow

1. **Build**: `npm run build-cdn`
2. **Test**: `npm run test-cdn`  
3. **Deploy**: `npm run deploy-cdn`

---
Generated on: 2025-09-17T06:48:31.569Z
Version: 1.0.0
