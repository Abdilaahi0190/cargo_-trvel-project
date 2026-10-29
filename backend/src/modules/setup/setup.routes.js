const path = require('path');
const multer = require('multer');
const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const checkPrivilege = require('../../middleware/privilege');
const validate = require('../../middleware/validate');
const schemas = require('../../validators/schemas');
const controller = require('./setup.controller');
const updateBranchSchema = schemas.createBranch.fork(['branch_name', 'address_id'], (schema) => schema.optional()).min(1);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.resolve(process.cwd(), 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({ storage });

router.get('/countries', authenticate, checkPrivilege('setup.read'), controller.listCountries);
router.get('/cities', authenticate, checkPrivilege('setup.read'), controller.listCities);
router.get('/addresses', authenticate, checkPrivilege('setup.read'), controller.listAddresses);
router.get('/branches', authenticate, checkPrivilege('branches.list'), controller.listBranches);
router.get('/branches/:id', authenticate, checkPrivilege('branches.list'), controller.getBranch);

router.post('/cities', authenticate, checkPrivilege('branches.manage'), validate(schemas.createCity), controller.createCity);
router.put('/cities/:id', authenticate, checkPrivilege('branches.manage'), validate(schemas.updateCity), controller.updateCity);
router.delete('/cities/:id', authenticate, checkPrivilege('branches.manage'), controller.deleteCity);
router.post('/addresses', authenticate, checkPrivilege('branches.manage'), validate(schemas.createAddress), controller.createAddress);
router.post('/branches', authenticate, checkPrivilege('branches.manage'), validate(schemas.createBranch), controller.createBranch);
router.put('/branches/:id', authenticate, checkPrivilege('branches.manage'), validate(updateBranchSchema), controller.updateBranch);
router.delete('/branches/:id', authenticate, checkPrivilege('branches.manage'), controller.deleteBranch);
router.post(
  '/branches/:id/images',
  authenticate,
  checkPrivilege('branches.manage'),
  upload.fields([{ name: 'banner_img', maxCount: 1 }, { name: 'logo_img', maxCount: 1 }]),
  controller.updateBranchImages
);

module.exports = router;
