import { useAuth } from "./AuthContext"
import { useNetworkStore } from "../stores/useNetworkStore";

export function NetworkButton() {

  const { isOnline, refreshOnlineStatus } = useAuth()
  const checkOnlineStatus = useNetworkStore((state) => state.checkOnlineStatus);
  

  return (
    <button
      style={{
        backgroundColor: isOnline ? 'green' : 'red'
      }}
      onClick={async () => {
        console.log("Checking status...");
          await checkOnlineStatus();
      }}
    >
      Check Connection
    </button>
  )
}