import mongoose from "mongoose"

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  ownerId: {
    type: String,
    required: true
  },
  solved: {
    type: Boolean,
    required: true,
    default: false
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  }
});

export const TaskModel = mongoose.model("Task", taskSchema);
