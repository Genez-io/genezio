import { Button, Card, Container, Row, Col, Input } from "reactstrap";
import React, { useState, useEffect, useRef } from "react";
import { Task } from "../backend-sdk/task.sdk.js";
import { Env, Remote } from "../backend-sdk/remote.js";
Remote.env = Env.Local;

export default (props) => {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    async function fetchTasks() {
      const res = await Task.getAllByUser(
        JSON.parse(localStorage.getItem("user"))._id
      );
      if (res.success) {
        setTasks(res.tasks);
      }
    }
    fetchTasks();
  }, []);

  async function handleDelete(id) {
    const res = await Task.delete(id);
    if (res.success) {
      const newTasks = tasks.filter((task) => task._id !== id);
      setTasks(newTasks);
    }
  }

  async function handleEdit(id, title, solved) {
    const res = await Task.update(id, title, solved);
    if (res.success) {
      const newTasks = tasks.map((task) => {
        if (task._id === id) {
          task.title = title;
          task.solved = solved;
        }
        return task;
      });
      setTasks(newTasks);
    }
  }

  return (
    <Container className="mt-2">
      <Row className="mt-2">
        <Col sm="12">
          <Card className="p-4 mt-2">
            <h3>All Tasks</h3>

            {tasks.map((task) => (
              <div key={task._id}>
                <h4>{task.title}</h4>
                <p>{task.date}</p>
                <p>{task.solved ? "Solved" : "Not Solved"}</p>
                <Button color="danger" onClick={() => handleDelete()}>
                  Delete Task
                </Button>
                <Button
                  color="primary"
                  onClick={() => handleEdit(task._id, task.title, !task.solved)}
                >
                  {task.solved ? "Mark as Unsolved" : "Mark as Solved"}
                </Button>
              </div>
            ))}
            <Button
              color="primary"
              onClick={() => {
                props.history.push("/admin/add-task");
              }}
            >
              Add Task
            </Button>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};
