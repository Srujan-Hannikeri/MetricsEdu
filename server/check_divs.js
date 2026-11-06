const mongoose = require('mongoose');
const Timetable = require('./models/Timetable');

async function checkDivisions() {
  await mongoose.connect('mongodb://127.0.0.1:27017/metricsedu');
  const distinctDivs = await Timetable.distinct('division');
  const countC = await Timetable.countDocuments({ division: 'C' });
  const sampleC = await Timetable.find({ division: 'C' }).limit(3);
  console.log({ distinctDivs, countC, sampleC });
  process.exit(0);
}

checkDivisions();
