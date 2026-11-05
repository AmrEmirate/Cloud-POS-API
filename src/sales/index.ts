import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import apiRouter from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { initScheduler } from './jobs/scheduler';

export { default as salesApiRouter } from './routes';
export { initScheduler as initSalesScheduler } from './jobs/scheduler';

// Standalone sub-app for testing compatibility
export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

