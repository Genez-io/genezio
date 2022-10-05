import React from "react";
import { useNavigate } from "react-router-dom";

export default (props) => {
  const navigate = useNavigate();

  React.useEffect(() => {
    if (localStorage.getItem("apiToken") != null) {
      navigate("/admin/all-tasks");
    }
  }, []);

  return <>{props.element}</>;
};
