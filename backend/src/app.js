const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth.routes.js');
const branchRoutes = require('./routes/branch.routes.js');
const customerRoutes = require('./routes/customer.routes.js');
const cargoRoutes = require('./routes/cargo.routes.js');
const dashboardRoutes = require('./routes/dashboard.routes.js');
const tripRoutes = require('./routes/trip.routes.js');
const paymentRoutes = require('./routes/payment.routes.js');
const expenseRoutes = require('./routes/expense.routes.js');
const expensePaymentRoutes = require('./routes/expense-payment.routes.js');
const transportCtrl = require('./modules/transport/transport.controller.js');
const expenseCtrl = require('./controllers/expense.controller.js');
const { authenticate } = require('./middleware/auth');
const employeeRoutes = require('./routes/employee.routes.js');
const salaryRoutes = require('./routes/salary.routes.js');
const accountRoutes = require('./routes/account.routes.js');
const reportRoutes = require('./routes/report.routes.js');
const setupRoutes = require('./modules/setup/setup.routes.js');
const transportRoutes = require('./modules/transport/transport.routes.js');
const usersRoutes = require('./modules/users/users.routes.js');
const invoicesRoutes = require('./modules/invoices/invoices.routes.js');
const disputesRoutes = require('./modules/disputes/disputes.routes.js');
const notificationsRoutes = require('./modules/notifications/notifications.routes.js');
const insuranceRoutes = require('./modules/insurance/insurance.routes.js');
const apiLogger = require('./middleware/apiLogger.js');
const errorHandler = require('./middleware/errorHandler.js');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.example'), override: false });

const app = express();
const apiRouter = express.Router();
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : defaultOrigins;

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(apiLogger);
app.use(morgan('combined'));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 100000 : 100,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 100000 : 10,
  standardHeaders: true,
  legacyHeaders: false
});

apiRouter.use('/auth', authLimiter, authRoutes);
apiRouter.use('/branches', branchRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/cargo', cargoRoutes);
apiRouter.use('/trips', tripRoutes);
apiRouter.use('/payments', paymentRoutes);
apiRouter.use('/expenses', expenseRoutes);
apiRouter.use('/expense-payments', expensePaymentRoutes);
apiRouter.use('/employees', employeeRoutes);
apiRouter.use('/salary', salaryRoutes);
apiRouter.use('/accounts', accountRoutes);
apiRouter.use('/reports', reportRoutes);

app.use('/api', apiRouter);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/setup', setupRoutes);
app.use('/api/v1/transport', transportRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/invoices', invoicesRoutes);
app.use('/api/v1/disputes', disputesRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/insurance', insuranceRoutes);
app.get('/api/v1/routes', authenticate, transportCtrl.listRoutes);
app.get('/api/v1/expense-types', authenticate, expenseCtrl.getTypes);

app.use((req, res, next) => {
  const error = new Error('Not found');
  error.statusCode = 404;
  next(error);
});

app.use(errorHandler);

module.exports = app;
