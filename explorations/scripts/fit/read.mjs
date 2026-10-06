import { Decoder, Stream } from '@garmin/fitsdk'
import fs from 'fs'
const buf = fs.readFileSync(process.argv[2])
const d = new Decoder(Stream.fromByteArray(buf))
const { messages, errors } = d.read()
console.log('errors', errors.length, 'types', Object.keys(messages).map(k => k + ':' + messages[k].length).join(' '))
const s = messages.sessionMesgs?.[0]; console.log('SESSION', JSON.stringify(s))
const rec = messages.recordMesgs || []
console.log('records', rec.length, JSON.stringify(rec[0]), JSON.stringify(rec[rec.length-1]))
fs.writeFileSync('hr.json', JSON.stringify(rec.map(r => [r.timestamp, r.heartRate])))
for (const k of ['activityMesgs','sportMesgs','deviceInfoMesgs','lapMesgs','eventMesgs']) if (messages[k]) console.log(k, JSON.stringify(messages[k]).slice(0,600))
