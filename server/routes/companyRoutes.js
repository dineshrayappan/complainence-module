const express = require('express');
const router = express.Router();
const { getAllCompanies, getCompanyBySlug } = require('../config/companyRegistry');

// @desc    Get all active companies (safe metadata for workspace selector / directory)
// @route   GET /api/companies
// @access  Public
router.get('/', (req, res) => {
  try {
    const companies = getAllCompanies();
    res.status(200).json({
      success: true,
      count: companies.length,
      data: companies,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve company registry.',
    });
  }
});

// @desc    Validate and get metadata for a specific company workspace
// @route   GET /api/companies/:slug
// @access  Public
router.get('/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const company = getCompanyBySlug(slug);

    if (!company) {
      return res.status(404).json({
        success: false,
        code: 'WORKSPACE_NOT_FOUND',
        message: `Workspace '${slug}' not found. Please verify the URL.`,
      });
    }

    if (company.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'WORKSPACE_INACTIVE',
        message: `Workspace '${company.name}' is currently inactive.`,
        data: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          status: company.status,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.status,
        description: company.description,
        themeColor: company.themeColor,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to validate company workspace.',
    });
  }
});

module.exports = router;
