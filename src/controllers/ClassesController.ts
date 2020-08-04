import {Request, Response} from 'express';

import db from '../database/connection';
import convertHourToMinutes from '../utils/convertHoursToMinutes';

interface ScheduleItemBody 
{
    week_day: number,
    from: string,
    to: string
}

export default class ClassesController {

    async index(req: Request, res: Response)
    {
        const filters = req.query;
        const subject = filters.subject as string;
        const week_day = filters.week_day as string;
        const time = filters.time as string;

        if(!filters.week_day || !filters.subject || !filters.time)
        {
            return res.status(400).json({ 
                error: "Missing filters to search classes"
            });
        }

        const timeInMinutes = convertHourToMinutes(time);

        const classes = await db('classes')
            .whereExists(function(){
                this.select('class_schedule.*')
                    .from('class_schedule')
                    .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
                    .whereRaw('`class_schedule`.`week_day` = ??', [Number(week_day)])
                    .whereRaw('`class_schedule`.`from` <= ??', [timeInMinutes])
                    .whereRaw('`class_schedule`.`to` > ??', [timeInMinutes])
            })
            .where('classes.subject', '=', subject)
            .join('users', 'classes.user_id', '=', 'users.id')
            .select(['classes.*', 'users.*']);

        res.json(classes);
    }

    async create (req: Request, res: Response) {
        const {
            name,
            avatar,
            whatsapp,
            bio,
            subject,
            cost,
            schedule
        } = req.body;
    
        const transaction = await db.transaction();
    
        try
        {
            const insertedUsersIDs = await transaction('users').insert({
                name,
                avatar,
                whatsapp,
                bio
            });
        
            const user_id = insertedUsersIDs[0];
        
            const insertedClassesIDs = await transaction('classes').insert({
                subject,
                cost,
                user_id
            });
        
            const class_id = insertedClassesIDs[0];
        
            const classSchedule = schedule.map((scheduleItem: ScheduleItemBody) => {
                return {
                    class_id,
                    week_day: scheduleItem.week_day,
                    from: convertHourToMinutes(scheduleItem.from),
                    to: convertHourToMinutes(scheduleItem.to)
                }
            })
        
            await transaction('class_schedule').insert(classSchedule);
        
            await transaction.commit();
        
            return res.status(201).send();
        } 
        catch (err)
        {
            await transaction.rollback();
            return res.status(400).json({
                error: 'Unexpected error while creating new class'
            })
        }
    }
}