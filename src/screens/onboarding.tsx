import { invoke } from "@tauri-apps/api/core";

// import reactLogo from "./assets/react.svg";
// import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore } from "../utils/onboarding";
import { open } from '@tauri-apps/plugin-dialog';
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
function Onboarding() {

  const {directoryPath, setDirectoryPath} = useOnboardingStore();
  const [fileSelected, setFileSelected] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
        if(directoryPath) {
            navigate("/viewer");
        }
  }, [directoryPath]);
//   async function greet() {
//     // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
//     setGreetMsg(await invoke("greet", { name }));
//   }

  return (
    <main className="container border-0 border-red-500 flex items-center justify-center min-h-screen gap-5">
        <h1 className="text-2xl font-bold">Welcome to Shadowcrawler</h1>
        <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          setDirectoryPath(await open({ directory: true }) || "");
        }}
      >
        <input
          id="greet-input"
          className="w-96"
          value={directoryPath || "None"}
          onChange={async (e) => setDirectoryPath(await open({ directory: true }) || "")}
          placeholder="Enter your directory path..."
        />
        <button type="submit">Select Directory</button>
      </form>
      <button onClick={() => navigate("/viewer")}>Next</button> 

    </main>
  );
}

export default Onboarding;
