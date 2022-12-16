import { Row, Col } from "reactstrap";
import { useEffect, useState } from "react";
import Pagination from '@mui/material/Pagination';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import './App.css';
import { BlockchainServer } from "./sdk/blockchainServer.sdk"

const CHUNKS = 10

function App() {
  const [totalCount, setTotalCount] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [events, setEvents] = useState([])

  useEffect(() => {
    setCurrentIndex(0)
  }, [])

  useEffect(() => {
    // Use the SDK to get events from the BlockchainServer class hosted on genez.io
    BlockchainServer.getEvents(currentIndex, CHUNKS)
      .then((response) => {
        setEvents(response.events)
        setTotalCount(response.count)
      })
      .catch((error) => {
        console.error("An error occurred!", error)
        setEvents([])
      })
  }, [currentIndex])

  const handleChange = (param, value) => {
    setCurrentIndex((value - 1) * CHUNKS)
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Genezio Smart Contract Indexer</h1>

        <List sx={{ width: '100%', maxWidth: 360, bgcolor: 'background.paper' }}>
          {events.map((event) =>
            <ListItem>
              <ListItemText primary={event.name} secondary={event.blockNumber + " " + JSON.stringify(event.parameters)} />
            </ListItem>
          )
          }
        </List>
        <div>
        <Pagination count={Math.floor(totalCount / CHUNKS)} onChange={handleChange}></Pagination>
        </div>
      </header>
    </div>
  );
}

export default App;
