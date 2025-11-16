import 'dotenv/config';
import mongoose from 'mongoose';
import Standup from '../src/models/Standup';

async function run() {
  await mongoose.connect(process.env.MONGO_URI!);
  const res = await Standup.updateMany(
    { isDeleted: { $exists: false } },
    { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }
  );
  console.log('Updated docs:', res.modifiedCount);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
