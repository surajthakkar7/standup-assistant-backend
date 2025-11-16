import mongoose, { Schema, Types, Model } from 'mongoose';

export interface AIInsight {
  type: 'personal' | 'team';
  teamId: Types.ObjectId;
  date: string;              // YYYY-MM-DD
  userId?: Types.ObjectId;   // for personal
  standupId?: Types.ObjectId;// for personal
  data: any;                 // JSON-ish
  createdAt: Date;
  updatedAt: Date;
}

const AIInsightSchema = new Schema<AIInsight>(
  {
    type: { type: String, enum: ['personal', 'team'], required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    date: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    standupId: { type: Schema.Types.ObjectId, ref: 'Standup' },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

// Uniques for caching
AIInsightSchema.index({ type: 1, standupId: 1 }, { unique: true, partialFilterExpression: { type: 'personal' } });
AIInsightSchema.index({ type: 1, teamId: 1, date: 1 }, { unique: true, partialFilterExpression: { type: 'team' } });

const AIInsightModel: Model<AIInsight> =
  (mongoose.models.AIInsight as Model<AIInsight>) ||
  mongoose.model<AIInsight>('AIInsight', AIInsightSchema);

export default AIInsightModel;
