var dotenv = require('dotenv')
dotenv.config()
var express = require('express')
var app = express()
var cron = require('node-cron')
var nodemailer = require('nodemailer')
var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
})
const puppeteer = require('puppeteer')
async function getData() {
  const start = Date.now()
  const browser = await puppeteer.launch({
    headless: true,
  })
  const page = await browser.newPage()
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36'
  )
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    if (req.resourceType() == 'font' || req.resourceType() == 'image') {
      req.abort()
    } else {
      req.continue()
    }
  })
  await page.goto('https://www.cowin.gov.in/home')
  await page.waitForSelector('#mat-tab-label-0-2')
  await page.waitForTimeout(1000)
  await page.click('#mat-tab-label-0-2')
  await page.waitForTimeout(1000)
  await page.click('.ng-tns-c68-1')
  await page.waitForSelector('#mat-option-17')
  await page.waitForTimeout(1000)
  await page.click('#mat-option-17')
  await page.waitForTimeout(1000)
  await page.click('.ng-tns-c68-3')
  await page.waitForTimeout(1000)
  await page.click('#mat-option-44')
  await page.click('.district-search')
  await page.waitForTimeout(1000)
  let page1 = await getMainData(page)
  let tempPage = true
  while (tempPage) {
    await page.click('.carousel-control-next')
    await page.waitForTimeout(1000)
    tempPage = await getMainData(page)
    if (tempPage) {
      page1 = mixTwoPages(page1, tempPage)
    }
  }
  console.log(Date.now() - start)
  await browser.close()
  return { centers: page1, date: new Date().toISOString() }
}
async function getMainData(page) {
  await page.waitForTimeout(1000)
  const divCountA = await page.evaluate(() => {
    console.log('Reached debugging step 2 inside')
    const availablePara = document.querySelector('.available-para')
    if (availablePara) return null
    let rows = document.getElementsByClassName('col-sm-12')
    let arr = []
    for (let key in rows) {
      const center = rows[key]
      if (center.innerHTML) {
        // let availDate = parseInt(
        //   availDateContainer.querySelector('p').textContent.split(' ')[0]
        // )
        let availDate = 0
        let dateArrayObj = document.querySelector('.carousel-inner')
        let dateArrayP = dateArrayObj.querySelectorAll('p')
        const centerObj = {}
        const centerName = center.querySelector('.center-name-title')
        centerObj.name = centerName.textContent
        const ul = center.querySelectorAll('a')
        let doseData = center.querySelector('.dosetotal')
        console.log(doseData)
        doseData =
          doseData &&
          parseInt(
            doseData.querySelectorAll('span')['0'].textContent.split(' ')[1]
          )
        centerObj.table = []
        for (let a = 0; a < ul.length; a++) {
          if (ul[a].innerHTML) {
            centerObj.table.push({
              date: dateArrayP[availDate].textContent,
              // dateArrayP[availDate].textContent
              slot: ul[a].innerHTML,
              doseData,
            })
            availDate++
          }
        }
        arr.push(centerObj)
      }
    }
    return arr
  })
  return divCountA
}
function mixTwoPages(page1, page2) {
  page2.forEach((e) => {
    let index = page1.findIndex((curr) => curr.name === e.name)
    if (index === -1) {
      page1 = [...page1, ...page2]
    } else {
      page1[index].table = [...page1[index].table, ...e.table]
    }
  })
  return page1
}

async function main() {
  let data = await getData()
  let booked = []
  data.centers.map((center) => {
    center.table.map((obj) => {
      if (obj.slot === ' Booked ') {
        let index = booked.findIndex((value) => value.date === obj.date)
        if (index !== -1) {
          booked[index].center.push({
            name: center.name,
            doseData: obj.doseData,
          })
        } else {
          booked.push({
            date: obj.date,
            center: [{ name: center.name, doseData: obj.doseData }],
          })
        }
      }
    })
  })
  let available = []
  data.centers.map((center) => {
    let centerNameArray = center.name.split(' ')
    if (centerNameArray[centerNameArray.length - 1] === 'Paid') {
      return
    }
    center.table.map((obj) => {
      if (obj.slot !== ' Booked ' && obj.slot !== ' NA ' && obj.doseData > 0) {
        let index = available.findIndex((value) => value.date === obj.date)
        if (index !== -1) {
          available[index].center.push({
            name: center.name,
            doseData: obj.doseData,
          })
        } else {
          available.push({
            date: obj.date,
            center: [{ name: center.name, doseData: obj.doseData }],
          })
        }
      }
    })
  })
  data.booked = booked
  data.available = available
  return data
}
function sendMail(available) {
  let text = 'Vaccination slots available'
  if (available.length) {
    text = ''
    available.map((item) => {
      let temp = `Date : ${item.date} : ${item.center.length} slots available\n---------------------------------------------------\n`
      item.center.map(
        ({ name, doseData }) =>
          (temp = temp + ' ' + name + '\tdose1 : ' + doseData + '\n')
      )
      text += temp
    })
    text += 'https://selfregistration.cowin.gov.in/\n'
    var mailOptions = {
      from: process.env.EMAIL,
      to: 'anoopaneesh808@gmail.com , vipinvadakkot@gmail.com',
      //vipinvadakkot@gmail.com
      subject: text,
      text: text,
    }
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error)
      } else {
        console.log('Email sent: ' + info.response)
      }
    })
    sendWhatsappMessage(text)
  }
}
let taskId = 0
cron.schedule('* * * * *', async () => {
  console.log('Fetch data , taskId : ', taskId)
  taskId++
  let res = await main()
  console.log(res.available.length, 'available')
  if (res.available.length) {
    res.available.map((item) => {
      console.log(item.date)
      console.log('-------------------')
      item.center.map((center) => {
        console.log(`Center : ${center.name} Dose1 : ${center.doseData}`)
      })
    })
  }
  console.log(res.booked.length, 'booked')
  if (res.available.length) {
    console.log('Reached')
    sendMail(res.available)
  }
})
// async function testA() {
//   console.log('Fetch data , taskId : ', taskId)
//   taskId++
//   let res = await main()
//   console.log(res.available.length, 'available')
//   if (res.available.length) {
//     res.available.map((item) => {
//       console.log(item.date)
//       console.log('-------------------')
//       item.center.map((center) => {
//         console.log(`Center : ${center.name} Dose1 : ${center.doseData}`)
//       })
//     })
//   }
//   console.log(res.booked.length, 'booked')
//   if (res.available.length) {
//     console.log('Reached')
//     sendMail(res.available)
//   }
// }
// testA()
function sendWhatsappMessage(messageText) {
  const {
    ACCOUNT_SID,
    AUTH_TOKEN,
    PHONE_NUMBER1,
    PHONE_NUMBER2,
    PHONE_NUMBER3,
  } = process.env
  const users = [PHONE_NUMBER1, PHONE_NUMBER2, PHONE_NUMBER3]
  const client = require('twilio')(ACCOUNT_SID, AUTH_TOKEN)
  users.map((number) => {
    client.messages
      .create({
        from: 'whatsapp:+14155238886',
        body: messageText,
        to: `whatsapp:${number}`,
      })
      .then((message) => console.log(message.sid))
      .catch((err) => {
        console.log(err)
      })
  })
}
app.listen('4005', () => {
  console.log('Server listening at port 4005')
})
