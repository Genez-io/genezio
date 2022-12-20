import { Button, Card, Container, Row, Col, Input } from "reactstrap";
import React, { useState, useEffect, useRef } from "react";
import { User } from "../sdk/user.sdk.js";
import { useNavigate } from 'react-router-dom';


export default (props) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email || !password) {
      setError("All fields are mandatory");
      return;
    }

    setError("");

    const res = await User.login(email, password);

    if (!res.success) {
      setError(res.msg);
      return;
    } else {
      localStorage.setItem("apiToken", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      navigate("/admin/all-tasks");
    }
  }

  return (
    <Container className="mt-5">
      <Row className="mt-5">
        <Col sm="12" md={{ size: 6, offset: 3 }}>
          <Card className="p-4 mt-5">
            <div className="auth-wrapper">
              <div className="auth-inner">
                <form>
                  <h3>Sign In</h3>
                  <span className="text-danger">{error}</span>
                  <div className="mb-3">
                    <label>Email address</label>
                    <Input
                      className="form-control"
                      placeholder="Email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <label>Password</label>
                    <Input
                      className="form-control"
                      placeholder="Password"
                      type="password"
                      autoComplete="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="text-left">
                    <Button
                      type="submit"
                      color="primary"
                      onClick={(e) => handleSubmit(e)}
                    >
                      Submit
                    </Button>
                  </div>
                  <div className="mt-2">
                    <span>
                      Don't have an account?{" "}
                    <a href="/register">Register</a>
                      
                      </span>
                  </div>
                </form>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};
