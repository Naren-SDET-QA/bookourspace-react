import './index.css';
// Keep the critical module graph static so Vite can preload React, the shared
// provider and the Home route while the entry HTML/CSS are being delivered.
// The interactive HTML Guest/Google surface stays visible until App selects
// the destination, so startup never needs to wait on service-worker cleanup.
import './main.tsx';
