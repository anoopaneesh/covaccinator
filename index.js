var dotenv = require('dotenv')
dotenv.config()
var express = require("express");
var app = express();
var cron = require("node-cron");
var nodemailer = require("nodemailer");
var transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user:  process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});
const puppeteer = require("puppeteer");
async function getData() {
  const start = Date.now();
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36"
  );
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.resourceType() == "font" || req.resourceType() == "image") {
      req.abort();
    } else {
      req.continue();
    }
  });
  await page.goto("https://www.cowin.gov.in/home");
  await page.waitForSelector(".status-switch");
  await page.click(".status-switch");
  await page.click(".ng-tns-c64-1");
  await page.waitForSelector("#mat-option-17");
  await page.click("#mat-option-17");
  await page.waitForTimeout(1000);
  await page.click(".ng-tns-c64-3");
  await page.waitForTimeout(1000);
  await page.click("#mat-option-44");
  await page.click(".district-search");
  await page.waitForTimeout(1000);
  let page1 = await getMainData(page);
  let tempPage = true;
  while (tempPage) {
    await page.click(".carousel-control-next");
    await page.waitForTimeout(1000);
    tempPage = await getMainData(page);
    if (tempPage) {
      page1 = mixTwoPages(page1, tempPage);
    }
  }
  console.log(Date.now() - start);
  await browser.close();
  return { centers: page1, date: new Date().toISOString() };
}
async function getMainData(page) {
  const divCountA = await page.$$eval(".mat-main-field", (divs) => {
    const availablePara = document.querySelector(".available-para");
    if (availablePara) return null;
    let rows = document.getElementsByClassName("col-sm-12");
    let arr = [];
    for (let key in rows) {
      const center = rows[key];
      if (center.innerHTML) {
        const availDateContainer = document.querySelector(".active");
        let availDate = parseInt(
          availDateContainer.querySelector("p").textContent.split(" ")[0]
        );

        const centerObj = {};
        const centerName = center.querySelector(".center-name-title");
        centerObj.name = centerName.textContent;
        const ul = center.querySelectorAll("a");
        centerObj.table = [];
        for (let a in ul) {
          if (ul[a].innerHTML) {
            centerObj.table.push({
              date: availDate++,
              slot: ul[a].innerHTML,
            });
          }
        }
        arr.push(centerObj);
      }
    }
    return arr;
  });
  return divCountA;
}
function mixTwoPages(page1, page2) {
  page2.forEach((e) => {
    let index = page1.findIndex((curr) => curr.name === e.name);
    if (index === -1) {
      page1 = [...page1, ...page2];
    } else {
      page1[index].table = [...page1[index].table, ...e.table];
    }
  });
  return page1;
}

async function main() {
  let data = await getData();
  let booked = [];
  data.centers.map((center) => {
    center.table.map((obj) => {
      if (obj.slot === " Booked ") {
        let index = booked.findIndex((value) => value.date === obj.date);
        if (index !== -1) {
          booked[index].center.push(center.name);
        } else {
          booked.push({ date: obj.date, center: [center.name] });
        }
      }
    });
  });
  let available = [];
  data.centers.map((center) => {
    center.table.map((obj) => {
      if (obj.slot !== " Booked " && obj.slot !== " NA ") {
        let index = available.findIndex((value) => value.date === obj.date);
        if (index !== -1) {
          available[index].center.push(center.name);
        } else {
          available.push({ date: obj.date, center: [center.name] });
        }
      }
    });
  });
  data.booked = booked;
  data.available = available;
  return data;
}
function sendMail(available) {
  let text = "Vaccination slots available"
  if(available.length){
      text=""
      available.map((item)=>{
          let temp = `${item.date} : ${item.center.length} slots available\n`
          item.center.map(name => temp = temp+" "+name+"\n")
          text+=temp
      })
      var mailOptions = {
        from: process.env.EMAIL,
        to: "anoopaneesh808@gmail.com",
        subject: "Sending Email using Node.js",
        text: text,
      };
      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log(error);
        } else {
          console.log("Email sent: " + info.response);
        }
      });
  }
}
let taskId = 0;
cron.schedule("* * * * *", async () => {
  console.log("Fetch data , taskId : ", taskId);
  taskId++;
  let res = await main();
  console.log(res.available.length, "available");
  if(res.available.length){
    res.available.map(item => {
      console.log(item.date)
      console.log("-------------------")
      item.center.map(center=>{
        console.log(center)
      })
    })
  }
  console.log(res.booked.length, "booked");
  if(res.available.length){
      console.log("Reached")
      sendMail(res.available)
  }
});

app.listen("4005", () => {
  console.log("Server listening at port 4005");
});
