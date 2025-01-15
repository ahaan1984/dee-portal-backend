const districts = [
  'Baksa', 'Barpeta', 'Bongaigaon', 'Cachar', 'Charaideo', 'Chirang', 'Darrang', 
  'Dhemaji', 'Dhubri', 'Dibrugarh', 'Dima Hasao', 'Goalpara', 'Golaghat', 
  'Hailakandi', 'Jorhat', 'Kamrup Metropolitan', 'Kamrup', 'Karbi Anglong',
  'Karimganj', 'Kokrajhar', 'Lakhimpur', 'Majuli', 'Morigaon', 'Nagaon', 
  'Nalbari', 'Sivasagar', 'Sonitpur', 'South Salmara-Mankachar', 'Tinsukia',
  'Udalguri', 'West Karbi Anglong', 'Biswanath Chariali', 'Hojai', 'Bajali', 'Tamulpur'
];

const generateEmployeeID = (district, role, lastAssigned) => {
  const roleMap = {
    superadmin: { R: 1, DD: "00" },
    admin: { R: 2, DD: "00" },
    viewer: { R: 0, DD: "00" },
    district_admin: { R: 1 },
    district_viewer: { R: 0 },
  };

  if (!roleMap[role]) {
    throw new Error(`Invalid role: ${role}`);
  }

  const DD = roleMap[role].DD || 
    (districts.indexOf(district) + 1).toString().padStart(2, "0");

  const R = roleMap[role].R;

  const XX = (lastAssigned + 1).toString().padStart(2, "0");

  return `${DD}${R}${XX}`;
};

const getDistrictFromID = (employeeID) => {
  const districtCode = parseInt(employeeID.slice(0, 2));
  if (districtCode === 0) return null;
  if (districtCode > 0 && districtCode <= districts.length) {
    return districts[districtCode - 1];
  }
  return null;
};

module.exports = {
  generateEmployeeID,
  getDistrictFromID
};