/**
 * One-time migration: maps legacy institutionType values
 *   'college' → 'institute'
 * Run with: node server/migrate_institution_types.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/metricsedu';

async function migrate() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected.\n');

  // Raw collection access — bypass Mongoose enum validation
  const db = mongoose.connection.db;

  // 1. Users
  const userResult = await db.collection('users').updateMany(
    { institutionType: 'college' },
    { $set: { institutionType: 'institute' } }
  );
  console.log(`👤 Users migrated:    ${userResult.modifiedCount} ('college' → 'institute')`);

  // 2. Timetables
  const ttResult = await db.collection('timetables').updateMany(
    { institutionType: 'college' },
    { $set: { institutionType: 'institute' } }
  );
  console.log(`📅 Timetables migrated: ${ttResult.modifiedCount} ('college' → 'institute')`);

  // 3. Courses
  const courseResult = await db.collection('courses').updateMany(
    { institutionType: 'college' },
    { $set: { institutionType: 'institute' } }
  );
  console.log(`📚 Courses migrated:  ${courseResult.modifiedCount} ('college' → 'institute')`);

  // 4. Fix old admin ADM-2026-001 and ADM-SCH-001 to have correct types
  const adminInst = await db.collection('users').updateOne(
    { adminId: 'ADM-2026-001' },
    { $set: { institutionType: 'institute' } }
  );
  const adminSch = await db.collection('users').updateOne(
    { adminId: 'ADM-SCH-001' },
    { $set: { institutionType: 'school' } }
  );
  console.log(`\n🔑 Admin ADM-2026-001 → 'institute': ${adminInst.modifiedCount}`);
  console.log(`🔑 Admin ADM-SCH-001  → 'school':    ${adminSch.modifiedCount}`);

  // 5. Fix existing teachers: those with school institutionType keep it, rest → institute
  // (they were already updated in step 1)
  
  // 6. Verify final counts
  const instCount  = await db.collection('users').countDocuments({ institutionType: 'institute' });
  const schoolCount = await db.collection('users').countDocuments({ institutionType: 'school' });
  const collegeLeft = await db.collection('users').countDocuments({ institutionType: 'college' });
  
  console.log(`\n📊 Final user counts:`);
  console.log(`   institute: ${instCount}`);
  console.log(`   school:    ${schoolCount}`);
  console.log(`   college (remaining): ${collegeLeft}`);

  await mongoose.disconnect();
  console.log('\n✅ Migration complete.');
}

migrate().catch(e => { console.error('❌ Migration failed:', e.message); process.exit(1); });
