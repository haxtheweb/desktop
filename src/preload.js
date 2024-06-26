import { contextBridge, ipcRenderer } from "electron";
try {
	contextBridge.exposeInMainWorld("api", {
		getExpressAppUrl: () => ipcRenderer.invoke("get-express-app-url")
	});
	contextBridge.exposeInMainWorld("ipcRenderer", {
		on: (channel, listener) => {
			ipcRenderer.on(channel, listener);
		}
	}); 
	
	contextBridge.exposeInMainWorld('darkMode', {
		toggle: () => ipcRenderer.invoke('dark-mode:toggle'),
		system: () => ipcRenderer.invoke('dark-mode:system')
	});
} catch (error) {
	console.error(error);
}