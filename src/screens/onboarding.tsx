// import { invoke } from "@tauri-apps/api/core";

// import reactLogo from "./assets/react.svg";
// import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore } from "../utils/onboarding";
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function Onboarding() {
  const {directoryPath, setDirectoryPath} = useOnboardingStore();
  const [selectedPath, setSelectedPath] = useState<string>(directoryPath || "");
  const navigate = useNavigate();
  
  useEffect(() => {
    if(directoryPath) {
      navigate("/viewer");
    }
  }, [directoryPath]);

  const handleDirectorySelect = async () => {
    const path = await open({ directory: true, recursive: true });
    if (path) {
      console.log("Selected path:", path);
      setSelectedPath(path);
      setDirectoryPath(path);
    }
  };

  return (
    <main className="container border-0 border-red-500 flex items-center justify-center min-h-screen gap-5">
        <h1 className="text-2xl font-bold">Welcome to Shadowcrawler</h1>
        <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          await handleDirectorySelect();
        }}
      >
        <input
          id="greet-input"
          className="w-96"
          value={selectedPath}
          readOnly
          placeholder="Click 'Select Directory' to choose a folder..."
        />
        <button type="submit">Select Directory</button>
      </form>
      <button onClick={() => navigate("/viewer")}>Next</button> 
    </main>
  );
}

export default Onboarding;
