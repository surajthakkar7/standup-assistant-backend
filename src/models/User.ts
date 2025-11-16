import { Schema, model, Document, Types } from 'mongoose';


export interface IUser extends Document {
name: string;
email: string;
passwordHash: string;
teams: Types.ObjectId[];
createdAt: Date;
}


const userSchema = new Schema<IUser>({
name: { type: String, required: true },
email: { type: String, required: true, unique: true, index: true },
passwordHash: { type: String, required: true },
teams: [{ type: Schema.Types.ObjectId, ref: 'Team', default: [] }],
createdAt: { type: Date, default: Date.now }
});


export default model<IUser>('User', userSchema);