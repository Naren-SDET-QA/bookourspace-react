import { ClassesServiceCard } from './ClassesServiceCard';
import type { CourseListing } from '../../data/classesTimingsData';

interface ClassesStyleThreeCardsProps {
  courses: CourseListing[];
  onOpen: (course: CourseListing) => void;
}

export function ClassesStyleThreeCards({ courses, onOpen }: ClassesStyleThreeCardsProps) {
  return (
    <div className="bos-classes-fk grid grid-cols-1 gap-3 lg:grid-cols-2">
      {courses.map((course) => (
        <article key={course.id} aria-label={`Course listing ${course.title}`}>
          <ClassesServiceCard course={course} onOpen={onOpen} layout="featured" embedded />
          <button type="button" aria-label={`View ${course.title}`} onClick={() => onOpen(course)} className="sr-only">
            View Details
          </button>
        </article>
      ))}
    </div>
  );
}
