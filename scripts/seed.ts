import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Team from '../src/models/Team';
import Standup from '../src/models/Standup';
import User from '../src/models/User';

async function main() {
  const uri = process.env.MONGO_URI!;
  await mongoose.connect(uri);
  console.log('Connected to Mongo');

  // Cleanup
  await Promise.all([User.deleteMany({}), Team.deleteMany({}), Standup.deleteMany({})]);

  // Users
  const pw = await bcrypt.hash('secret123', 10);
  const users = await User.insertMany([
    { name: 'Suraj Thakkar', email: 'suraj@test.com', passwordHash: pw },
    { name: 'Anita Dev', email: 'anita@test.com', passwordHash: pw },
    { name: 'Ravi Kumar', email: 'ravi@test.com', passwordHash: pw },
    { name: 'Priya Shah', email: 'priya@test.com', passwordHash: pw },
    { name: 'Amit Patel', email: 'amit@test.com', passwordHash: pw }
  ]);

  // Team
  const owner = users[0]._id;
  const memberIds = users.map(u => u._id);
  const team = await Team.create({
    name: 'Platform Team',
    ownerId: owner,
    members: memberIds,
    isDeleted: false,
    code: Math.random().toString(36).slice(2, 8).toUpperCase(),
  });

  // Helper to ISO date (YYYY-MM-DD)
  const toISO = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(d);

  // Standups for last 7 days for each user
  const today = new Date();
  const days = Array.from({ length: 7 }).map((_, i) => {
    const dd = new Date(today);
    dd.setDate(today.getDate() - (6 - i));
    return toISO(dd);
  });

  const texts = [
    ['Fixed auth bug', 'Add AI prompt tuning', 'CI blocker'],
    ['Worked on charts', 'Finish insights page', 'Env issue'],
    ['Code review', 'Team API cleanup', 'None'],
  ];

  const docs: any[] = [];
  for (const date of days) {
    for (const u of users) {
      const pick = texts[Math.floor(Math.random() * texts.length)];
      docs.push({
        userId: u._id,
        teamId: team._id,
        date,
        yesterday: `- ${pick[0]}\n- Refactor tests`,
        today: `- ${pick[1]}\n- Pair on review`,
        blockers: Math.random() < 0.4 ? pick[2] : '',
        isDeleted: false,
      });
    }
  }
  await Standup.insertMany(docs);

  console.log('Seeded users, team, and standups.');
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
