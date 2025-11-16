// src/models/Standup.ts
import mongoose, { Schema, Types, Model } from 'mongoose';

export interface IStandup {
  userId: Types.ObjectId;
  teamId: Types.ObjectId;
  date: string;               // 'YYYY-MM-DD' in IST
  yesterday: string;
  today: string;
  blockers: string;

  // soft delete
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

const StandupSchema = new Schema<IStandup>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    date:   { type: String, required: true, index: true },
    yesterday: { type: String, default: '' },
    today:     { type: String, default: '' },
    blockers:  { type: String, default: '' },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Unique (userId, date) among NON-deleted docs
StandupSchema.index(
  { userId: 1, date: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// Helpful composite index
StandupSchema.index({ teamId: 1, date: 1, isDeleted: 1 });

// Prevent OverwriteModelError during hot reload
const Standup: Model<IStandup> =
  (mongoose.models.Standup as Model<IStandup>) || mongoose.model<IStandup>('Standup', StandupSchema);

export default Standup;
