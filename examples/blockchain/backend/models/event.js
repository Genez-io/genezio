import mongoose from 'mongoose'

const eventSchema = new mongoose.Schema({
  id: String,
  name: String,
  parameters: Map,
});

export const EventModel = mongoose.model('Event', eventSchema);