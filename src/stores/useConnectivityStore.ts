
import { create } from 'zustand';

export type NetworkStatus = 'online'| 'offline'| 'unknown';
export type R2Status = 'online' | 'offline' | 'unknown';

export interface ConnectivityStore {
  network: NetworkStatus;
  r2: R2Status;

  setNetworkStatus: (status: NetworkStatus) => void;
  setR2Status: (status: R2Status) => void;
  checkR2: () => Promise<void>;
}

export const useConnectivityStore = create<ConnectivityStore>((set, get) => ({
  
  network: 'online',
  r2: 'online',

  setNetworkStatus: (status) =>  set({ network: status }),
  setR2Status: (status: R2Status) =>  set({ r2: status }),
  checkR2: async () => {
    try {
      // 1. Clean GET request (no body)
      const response = await fetch("/api/aggregates/health", {
        method: "GET",
        // Optional: add a cache-busting parameter or header so the browser doesn't return 304 Cached
        headers: { "Cache-Control": "no-cache" },
      });

      // 2. Health check endpoint returned success (200 OK)
      if (response.ok) {
        get().setNetworkStatus("online");
        get().setR2Status("online");
        return;
      }

      // 3. Endpoint missing / file missing on server (404)
      if (response.status === 404) {
        console.warn("Healthcheck endpoint or file missing.");
        get().setR2Status("unknown");
        // Network is up (server responded), but R2 file is unreachable
        get().setNetworkStatus("online"); 
        return;
      }

      // 4. Any other non-200 HTTP status (e.g., 503, 500)
      get().setNetworkStatus("offline");
      get().setR2Status("offline");

    } catch (err: any) {
      // 5. Hard network failure (e.g., client offline, DNS failure, CORS error)
      console.warn(`Healthcheck fetch failed: ${err.message}`);
      get().setNetworkStatus("offline");
      get().setR2Status("offline");
    }
  },
    }
  )
);

