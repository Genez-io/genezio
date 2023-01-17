import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "../sdk/user.sdk.js";

export default (props) => {
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
      const res = await User.checkSession(localStorage.getItem("apiToken"));
      if (!res.success) {
        localStorage.clear();
        navigate("/login");
      }
    }
    checkToken();
  }, []);

  return <>{props.element}</>;
};
