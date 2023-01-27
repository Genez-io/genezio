import React from "react";
import { useNavigate } from "react-router-dom";
import { UserService } from "../sdk/userService.sdk";

export default (props: any) => {
  const navigate = useNavigate();

  React.useEffect(() => {
    if (
      localStorage.getItem("apiToken") == null ||
      localStorage.getItem("user") == null
    ) {
      localStorage.clear();
      navigate("/login");
    }

    async function checkToken() {
      const apiToken = localStorage.getItem("apiToken");
      if (!apiToken) {
        navigate("/login");
        return;
      }
      
      const res = await UserService.checkSession(apiToken);
      if (!res.success) {
        localStorage.clear();
        navigate("/login");
      }
    }
    checkToken();
  }, []);

  return <>{props.element}</>;
};
