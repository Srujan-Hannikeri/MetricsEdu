const mongoose = require('mongoose');
const Timetable = require('./models/Timetable');
const Course = require('./models/Course');
const User = require('./models/User');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/metricsedu');
  const ttCount = await Timetable.countDocuments();
  const cCount = await Course.countDocuments();
  const uCount = await User.countDocuments();
  const sampleTT = await Timetable.find().limit(2);
  console.log({ ttCount, cCount, uCount, sampleTT });
  process.exit(0);
}

check();
