import { useApp } from '../lib/store'
import { useLive } from '../lib/live'
import { ManagementShell } from '../components/ManagementShell'
import { Overview, Timetable, AttendanceOverview, Workload } from './Operations'
import { Teachers, TeacherProfile, Classes, ClassDetail, Rooms } from './People'
import { Subjects } from './Subjects'
import { Assignments, Exams, Leave, Tasks, Announcements } from './Academics'
import { Reports, Analytics, Settings, Billing } from './Insight'

export function Management() {
  const { route, param } = useApp()
  const { user } = useLive()
  let page
  switch (route) {
    case 'overview': page = <Overview />; break
    case 'timetable': page = <Timetable />; break
    case 'attendance': page = <AttendanceOverview />; break
    case 'workload': page = <Workload />; break
    case 'teachers': page = <Teachers />; break
    case 'teacher-profile': page = <TeacherProfile id={param} />; break
    case 'classes': page = <Classes />; break
    case 'class-detail': page = <ClassDetail id={param} />; break
    case 'subjects': page = <Subjects />; break
    case 'rooms': page = <Rooms />; break
    case 'assignments': page = <Assignments />; break
    case 'exams': page = <Exams />; break
    case 'leave': page = <Leave />; break
    case 'tasks': page = <Tasks />; break
    case 'announcements': page = <Announcements />; break
    case 'reports': page = <Reports />; break
    case 'analytics': page = <Analytics />; break
    case 'settings': page = <Settings />; break
    case 'billing': page = user.features?.billing ? <Billing /> : <Overview />; break
    default: page = <Overview />
  }
  return <ManagementShell>{page}</ManagementShell>
}
