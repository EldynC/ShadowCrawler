import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Onboarding from "./screens/onboarding";
import Viewer from "./screens/viewer";
// import { Route } from "react-router-dom";
let router = createBrowserRouter([
  {
    path: "/",
    Component: Onboarding,  // Onboarding is now the default
  },
  {
    path: "/home",
    Component: App,         // Move App to /home
  },
  {
    path: "/viewer",
    Component: Viewer,         // Move App to /home
  },
  {
    path: "*",
    Component: Onboarding,  // Catch-all also goes to onboarding
  },
]);
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
       
        <RouterProvider router={router} />


  
  </React.StrictMode>,
);
