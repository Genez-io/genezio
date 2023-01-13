import { EventModel } from "./models/event.js"
import { mongoose } from "mongoose";
import { MONGO_DB_URI } from "./config.js"


export class Cron {
  constructor() {
    this.#connect();
  }

  /**
   * Private method used to connect to the DB.
   */
  #connect() {
    mongoose.connect(MONGO_DB_URI);
  }

  /**
   * Method that will be called by the cron job.
   * 
   * The method will delete all the data from the DB.
   */
  async deleteAllData() {
    console.log("Deleting all data from the DB");
    try {
      await EventModel.deleteMany();
      console.log("All events deleted from the DB");
    }
    catch (error) {
      console.log("Error while deleting all data from the DB", error);
    }
  }
}
