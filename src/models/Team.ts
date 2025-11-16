// src/models/Team.ts
import mongoose, { Schema, Types, Model } from 'mongoose';

export interface ITeam {
  name: string;
  ownerId: Types.ObjectId;           // creator
  adminIds: Types.ObjectId[];        // team admins (owner is implicitly admin)
  members: Types.ObjectId[];         // all members incl. owner
  code: string;                       // join code

  // Soft delete fields
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    adminIds: [{ type: Schema.Types.ObjectId, ref: 'User', index: true, default: [] }],
    members: [{ type: Schema.Types.ObjectId, ref: 'User', index: true, default: [] }],

    code: { type: String, required: true },

    // Soft delete
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Ensure join code is unique among NON-DELETED teams (reusable after delete)
TeamSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

// Helpful compound index for quick lookups by owner & name
TeamSchema.index({ ownerId: 1, name: 1 });

// Keep owner in members array; dedupe arrays
TeamSchema.pre('save', function (next) {
  const owner = this.ownerId?.toString();
  if (owner) {
    const asStr = (arr?: Types.ObjectId[]) => (arr || []).map(x => x?.toString());
    const membersSet = new Set(asStr(this.members));
    membersSet.add(owner);
    this.members = Array.from(membersSet).map(id => new mongoose.Types.ObjectId(id));

    // If you want owner to always be admin as well:
    const adminsSet = new Set(asStr(this.adminIds));
    adminsSet.add(owner);
    this.adminIds = Array.from(adminsSet).map(id => new mongoose.Types.ObjectId(id));
  }
  next();
});

// Prevent OverwriteModelError in dev (nodemon/tsx reloads)
const Team: Model<ITeam> =
  (mongoose.models.Team as Model<ITeam>) || mongoose.model<ITeam>('Team', TeamSchema);

export default Team;
