const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'graphics', 'scenery', 'treesData.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const mapping = {
  'BirchTree_1': 'Tree_1',
  'BirchTree_2': 'Tree_2',
  'BirchTree_3': 'Tree_3',
  'BirchTree_4': 'Bush_1',
  'BirchTree_5': 'Plant_1',

  'TwistedTree_1': 'Tree_2',
  'TwistedTree_2': 'Tree_3',
  'TwistedTree_3': 'Rock_1',
  'TwistedTree_4': 'Log_1',
  'TwistedTree_5': 'Bush_2',

  'MapleTree_1': 'Tree_3',
  'MapleTree_2': 'Tree_1',
  'MapleTree_3': 'Tree_2',
  'MapleTree_4': 'Plant_2',
  'MapleTree_5': 'Rock_2',

  'Pine_1': 'Tree_1',
  'Pine_2': 'Tree_2',
  'Pine_3': 'Tree_3',
  'Pine_4': 'Bush_3',
  'Pine_5': 'Log_2',

  'CommonTree_1': 'Tree_2',
  'CommonTree_2': 'Tree_1',
  'CommonTree_3': 'Tree_3',
  'CommonTree_4': 'Rock_3',
  'CommonTree_5': 'Plant_3'
};

const updatedData = data.map(item => {
  if (mapping[item.type]) {
    item.type = mapping[item.type];
  }
  return item;
});

fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
console.log('Successfully updated treesData.json with new environment types!');
