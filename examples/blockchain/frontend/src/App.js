import { Row, Col } from "reactstrap";
import { useEffect, useState } from "react";
import './App.css';
import { BlockchainServer } from "./sdk/blockchainServer.sdk"

const CHUNKS = 10

function App() {
  const [totalCount, setTotalCount] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [events, setEvents] = useState([])

  useEffect(() => {
    setCurrentIndex(0)
  }, [])

  useEffect(() => {
    BlockchainServer.getEvents(0, CHUNKS)
      .then((response) => {
        setEvents(response.events)
        setTotalCount(response.count)
        console.log(response)
      })
      .catch((error) => {
        console.error("An error occurred!", error)
        setEvents([])
      })
  }, [currentIndex])

  const newPageButtonClicked = () => {
    setCurrentIndex(currentIndex + CHUNKS)
  }

  return (
    <div className="App">
      <header className="App-header">
        <Col sm="11">
          <Row>
            <Col sm="12">
              <Row>{}</Row>
              {events.map((event) => (
                <div key={event._id} className="mb-3">
                   <p className="mb-0">
                    <span className="h4">{event.name}</span>
                    { Object.keys(event.parameters).map((key) =>
                      (<p>key : {event.parameters[key]}</p>)
                    ) }
                   </p> 
                </div>
              ))}
            </Col>
          </Row>
        </Col>
      </header>
    </div>
  );
}

export default App;
